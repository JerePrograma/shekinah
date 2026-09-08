import { readDuxCatalogSnapshot } from './dux-catalog';
import { sha256Hex } from './crypto';
import { editorialApiGet, requireMercadoLibreEditorial } from './mercado-libre-editorial-access';
import { admittedEditorialStatus, EDITORIAL_SELLER_ID, editorialCandidates, parseEditorialItem } from './mercado-libre-editorial-policy';
import { currentEditorialRun, editorialError, editorialSourceIdentity, parseEditorialState,
  readEditorialObject, requireEditorialDuxIdentity, storeEditorialObject, type EditorialItemObject, type EditorialLink } from './mercado-libre-editorial-store';
import type { D1Database, Env } from './platform';
import { assertExactKeys, isRecord, readSafeText } from './validation';

export async function getEditorialReview(database: D1Database, env: Env, code: string, itemId: string | null) {
  requireMercadoLibreEditorial(env);
  const dux = await requireEditorialDuxIdentity(database, code);
  const run = await currentEditorialRun(database);
  if (run === null) throw editorialError('ML_EDITORIAL_INITIAL_IMPORT_REQUIRED', 409);
  const state = parseEditorialState(run.state_json);
  const objects = (await database.prepare(`SELECT object.hash,object.payload_json FROM ml_editorial_objects object
    JOIN json_each(?1) manifest ON manifest.value=object.hash WHERE object.kind='item'`)
    .bind(JSON.stringify(state.itemHashes)).all<{hash:string;payload_json:string}>()).results ?? [];
  const units = objects.flatMap(row => (JSON.parse(row.payload_json) as EditorialItemObject).units);
  const snapshot = await readDuxCatalogSnapshot(database);
  const candidates = editorialCandidates(snapshot.items.map(item => ({ code: item.code,
    barcodes: [...new Set((item.warehouseStocks ?? []).flatMap(stock => stock.barcode === null ? [] : [stock.barcode]))] })), units).filter(candidate => candidate.code === code);
  const selectedIds = itemId === null ? [...new Set(candidates.map(candidate => candidate.itemId))].slice(0,20) : [itemId];
  if (selectedIds.some(id => !/^MLA\d{5,25}$/u.test(id))) throw editorialError('ML_EDITORIAL_ITEM_INVALID',400);
  const sources = [];
  for (const id of selectedIds) {
    const hash = state.itemHashes[id];
    if (hash === undefined) continue;
    const item = await readEditorialObject<EditorialItemObject>(database, hash, 'item');
    if (item.sellerId !== EDITORIAL_SELLER_ID || !admittedEditorialStatus(item.status)) continue;
    sources.push({ hash, ...item });
  }
  return { dux, duxIdentityHash: await sha256Hex(JSON.stringify(dux)), runId: run.id, candidates, sources,
    association: await database.prepare("SELECT * FROM ml_editorial_links WHERE company_id='12862' AND cod_item=?1").bind(code).first<EditorialLink>() };
}

export async function reviewEditorialAssociation(database: D1Database, env: Env, actor: string, value: unknown) {
  requireMercadoLibreEditorial(env);
  if (!isRecord(value)) throw editorialError('ML_EDITORIAL_REVIEW_INVALID',400);
  assertExactKeys(value,['code','itemId','variationId','evidenceHash','duxIdentityHash','decision','reason','presentationVerified','packVerified','variantVerified','images','description','expectedRevision']);
  const code=readSafeText(value.code,'code',180), itemId=readSafeText(value.itemId,'itemId',30);
  const hash=readSafeText(value.evidenceHash,'evidenceHash',64), reason=readSafeText(value.reason,'reason',2000);
  const variationId=value.variationId===null?'':readSafeText(value.variationId,'variationId',30);
  if (!/^MLA\d{5,25}$/u.test(itemId) || !/^[a-f0-9]{64}$/u.test(hash) || (variationId!==''&&!/^[1-9]\d{0,29}$/u.test(variationId)) ||
    !['approve','reject','revoke'].includes(String(value.decision)) || typeof value.images!=='boolean' || typeof value.description!=='boolean' ||
    !Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision)<0) throw editorialError('ML_EDITORIAL_REVIEW_INVALID',400);
  const dux=await requireEditorialDuxIdentity(database,code);
  if (value.duxIdentityHash !== await sha256Hex(JSON.stringify(dux))) throw editorialError('ML_EDITORIAL_DUX_IDENTITY_CHANGED',409);
  const evidence=await readEditorialObject<EditorialItemObject>(database,hash,'item');
  const selected=evidence.units.find(unit=>unit.itemId===itemId&&(unit.variationId??'')===variationId);
  if(evidence.sellerId!==EDITORIAL_SELLER_ID||selected===undefined)throw editorialError('ML_EDITORIAL_EVIDENCE_INVALID',409);
  const approved=value.decision==='approve';
  if(approved && (value.presentationVerified!==true||value.packVerified!==true||value.variantVerified!==true||(!value.images&&!value.description)))throw editorialError('ML_EDITORIAL_IDENTITY_REVIEW_REQUIRED',400);
  if(approved){
    const current=parseEditorialItem(await editorialApiGet(database,env,`/items/${itemId}`)).find(unit=>(unit.variationId??'')===variationId);
    if(current===undefined||!admittedEditorialStatus(current.status)||editorialSourceIdentity(current)!==editorialSourceIdentity(selected))throw editorialError('ML_EDITORIAL_SOURCE_CHANGED',409);
    await storeEditorialObject(database,'item',{itemId,sellerId:EDITORIAL_SELLER_ID,status:current.status,units:[current]},new Date().toISOString());
  }
  const revision=Number(value.expectedRevision)+1, status=approved?'approved':value.decision==='reject'?'rejected':'revoked';
  const now=new Date().toISOString();
  const decision={code,itemId,variationId:variationId||null,status,revision,reason,images:value.images,description:value.description,
    presentationVerified:value.presentationVerified===true,packVerified:value.packVerified===true,variantVerified:value.variantVerified===true,
    duxIdentity:dux,sourceIdentity:editorialSourceIdentity(selected),evidenceHash:hash,method:'explicit_review'};
  const statements=[database.prepare(`INSERT INTO ml_editorial_links
    (company_id,cod_item,item_id,variation_id,seller_id,status,revision,dux_identity_json,source_identity_json,evidence_hash,images_approved,description_approved,method,reason,decided_by,decided_at)
    SELECT '12862',?1,?2,?3,'445638367',?4,?5,?6,?7,?8,?9,?10,'explicit_review',?11,?12,?13
    WHERE ?14=COALESCE((SELECT revision FROM ml_editorial_links WHERE company_id='12862' AND cod_item=?1),0)
    ON CONFLICT(company_id,cod_item) DO UPDATE SET item_id=excluded.item_id,variation_id=excluded.variation_id,status=excluded.status,
      revision=excluded.revision,dux_identity_json=excluded.dux_identity_json,source_identity_json=excluded.source_identity_json,
      evidence_hash=excluded.evidence_hash,images_approved=excluded.images_approved,description_approved=excluded.description_approved,
      method=excluded.method,reason=excluded.reason,decided_by=excluded.decided_by,decided_at=excluded.decided_at`)
    .bind(code,itemId,variationId,status,revision,JSON.stringify(dux),editorialSourceIdentity(selected),hash,value.images?1:0,value.description?1:0,reason,actor,now,Number(value.expectedRevision)),
    database.prepare(`INSERT INTO ml_editorial_decisions (company_id,cod_item,revision,decision_json,actor,created_at)
      SELECT '12862',cod_item,revision,?1,?2,?3 FROM ml_editorial_links WHERE company_id='12862' AND cod_item=?4 AND revision=?5 AND decided_at=?3`)
      .bind(JSON.stringify(decision),actor,now,code,revision)];
  try{const results=await database.batch(statements);if(results[0]?.meta.changes!==1)throw editorialError('ML_EDITORIAL_REVIEW_CONFLICT',409);}
  catch{throw editorialError('ML_EDITORIAL_REVIEW_CONFLICT',409);}
  return {code,status,revision,contentRefreshRequired:approved};
}
