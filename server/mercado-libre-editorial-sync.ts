import { HttpError } from './http';
import { editorialApiGet, requireMercadoLibreEditorial } from './mercado-libre-editorial-access';
import { importEditorialImage } from './mercado-libre-editorial-images';
import { admittedEditorialStatus, EDITORIAL_SELLER_ID, parseEditorialItem, transformEditorialDescription } from './mercado-libre-editorial-policy';
import { MercadoLibreProviderError } from './mercado-libre';
import { editorialError, editorialSourceIdentity, initialEditorialState, listEditorialLinks, ML_EDITORIAL_MAX_ITEMS,
  ML_EDITORIAL_MAX_UNITS, parseEditorialState, readEditorialObject, requireEditorialDuxIdentity,
  serializeEditorialState, storeEditorialObject, type EditorialItemObject, type EditorialRunRow, type EditorialRunState } from './mercado-libre-editorial-store';
import type { D1Database, Env } from './platform';
import { isRecord } from './validation';

/** Each authenticated request advances a bounded step; Dux synchronization is independent. */
export async function advanceEditorialSync(database: D1Database, env: Env, actor: string, requestedId: string | null) {
  requireMercadoLibreEditorial(env);
  const now = new Date().toISOString();
  const usage = await database.prepare('SELECT COUNT(*) AS runs,COALESCE(SUM(revision),0) AS steps FROM ml_editorial_runs WHERE started_at>=?1')
    .bind(`${now.slice(0,10)}T00:00:00.000Z`).first<{runs:number;steps:number}>();
  if ((usage?.steps ?? 0) >= 4000 || (requestedId === null && (usage?.runs ?? 0) >= 50)) throw editorialError('ML_EDITORIAL_DAILY_BUDGET',429);
  if (requestedId !== null && !/^ml_editorial_[a-f0-9-]{36}$/u.test(requestedId)) throw editorialError('ML_EDITORIAL_RUN_INVALID', 400);
  let run = requestedId === null
    ? await database.prepare("SELECT * FROM ml_editorial_runs WHERE status='running'").first<EditorialRunRow>()
    : await database.prepare('SELECT * FROM ml_editorial_runs WHERE id=?1').bind(requestedId).first<EditorialRunRow>();
  if (requestedId !== null && run === null) throw editorialError('ML_EDITORIAL_RUN_MISSING', 404);
  if (run === null) {
    const me = await editorialApiGet(database, env, '/users/me');
    if (!isRecord(me) || String(me.id) !== EDITORIAL_SELLER_ID || me.site_id !== 'MLA') throw editorialError('ML_EDITORIAL_SELLER_MISMATCH');
    const state = initialEditorialState(await listEditorialLinks(database));
    const id = `ml_editorial_${crypto.randomUUID()}`;
    try {
      await database.prepare("INSERT INTO ml_editorial_runs (id,actor,status,phase,state_json,started_at,updated_at) VALUES (?1,?2,'running','search',?3,?4,?4)")
        .bind(id, actor, serializeEditorialState(state), now).run();
    } catch { throw editorialError('ML_EDITORIAL_ALREADY_RUNNING', 409); }
    run = await database.prepare('SELECT * FROM ml_editorial_runs WHERE id=?1').bind(id).first<EditorialRunRow>();
    if (run === null) throw editorialError('ML_EDITORIAL_RUN_MISSING');
  }
  if (run.status !== 'running') return editorialProgress(run);
  const owner = crypto.randomUUID();
  const claimed = await database.prepare("UPDATE ml_editorial_runs SET lease_owner=?1,lease_until=?2 WHERE id=?3 AND status='running' AND revision=?4 AND (lease_until IS NULL OR lease_until<?5)")
    .bind(owner, new Date(Date.now() + 120_000).toISOString(), run.id, run.revision, now).run();
  if (claimed.meta.changes !== 1) throw editorialError('ML_EDITORIAL_BUSY', 409);
  try {
    if (Date.now() - Date.parse(run.started_at) > 2 * 60 * 60 * 1000) throw editorialError('ML_EDITORIAL_RUN_EXPIRED');
    const state = parseEditorialState(run.state_json);
    let phase = run.phase;
    if (phase === 'search') phase = await searchStep(database, env, state);
    else if (phase === 'metadata') phase = await metadataStep(database, env, state, now);
    else if (phase === 'content') phase = await contentStep(database, env, state, now);
    else if (phase !== 'publish') throw editorialError('ML_EDITORIAL_PHASE_INVALID');
    const completed = phase === 'publish';
    const updated = new Date().toISOString();
    const nextState = serializeEditorialState(state);
    const update = database.prepare(`UPDATE ml_editorial_runs SET state_json=?1,phase=?2,status=?3,completed_at=?4,
      updated_at=?5,revision=revision+1,lease_owner=NULL,lease_until=NULL
      WHERE id=?6 AND status='running' AND lease_owner=?7 AND revision=?8`)
      .bind(nextState, completed ? 'complete' : phase, completed ? 'succeeded' : 'running', completed ? updated : null, updated, run.id, owner, run.revision);
    const results = completed ? await database.batch([update,
      database.prepare(`INSERT INTO ml_editorial_state (id,current_run_id,updated_at)
        SELECT 1,id,updated_at FROM ml_editorial_runs WHERE id=?1 AND status='succeeded' AND revision=?2
        ON CONFLICT(id) DO UPDATE SET current_run_id=excluded.current_run_id,updated_at=excluded.updated_at`)
        .bind(run.id, run.revision + 1)]) : [await update.run()];
    if (results[0]?.meta.changes !== 1) throw editorialError('ML_EDITORIAL_LEASE_LOST', 409);
    return editorialProgress({ ...run, state_json: nextState, phase: completed ? 'complete' : phase,
      status: completed ? 'succeeded' : 'running', completed_at: completed ? updated : null, updated_at: updated });
  } catch (error: unknown) {
    const code = error instanceof HttpError && /^M(?:L_|ERCADO_LIBRE_)[A-Z_]+$/u.test(error.code) ? error.code : 'ML_EDITORIAL_UPDATE_FAILED';
    await database.prepare("UPDATE ml_editorial_runs SET status='failed',completed_at=?1,updated_at=?1,error_code=?2,lease_owner=NULL,lease_until=NULL WHERE id=?3 AND status='running' AND lease_owner=?4 AND revision=?5")
      .bind(new Date().toISOString(), code, run.id, owner, run.revision).run();
    throw editorialError(code, error instanceof HttpError ? error.status : 502);
  }
}

export function editorialProgress(run: EditorialRunRow) {
  const state = parseEditorialState(run.state_json);
  return { id: run.id, status: run.status, phase: run.phase, startedAt: run.started_at,
    updatedAt: run.updated_at, completedAt: run.completed_at, errorCode: run.error_code,
    items: state.ids.length, metadataCompleted: state.metadataOffset, metadataTotal: state.metadataQueue.length,
    associations: state.links.length, contentCompleted: state.contentOffset, fieldsPublished: Object.keys(state.publications).length,
    issues: state.issues };
}

async function searchStep(database: D1Database, env: Env, state: EditorialRunState): Promise<EditorialRunRow['phase']> {
  const status = ['active', 'paused'][state.searchStatus];
  if (status === undefined) throw editorialError('ML_EDITORIAL_SEARCH_STATE');
  const query = new URLSearchParams({ search_type: 'scan', status, limit: '100' });
  if (state.scroll !== null) query.set('scroll_id', state.scroll);
  const value = await editorialApiGet(database, env, `/users/${EDITORIAL_SELLER_ID}/items/search?${query}`);
  if (!isRecord(value) || !isRecord(value.paging) || !Number.isSafeInteger(value.paging.total) || Number(value.paging.total) < 0 ||
    Number(value.paging.total) > ML_EDITORIAL_MAX_ITEMS || (value.results !== null && !Array.isArray(value.results))) throw editorialError('ML_EDITORIAL_SEARCH_INVALID');
  const total = Number(value.paging.total);
  if (state.total !== null && total !== state.total) throw editorialError('ML_EDITORIAL_SEARCH_CHANGED');
  state.total = total;
  const ids: unknown[] = value.results === null ? [] : value.results as unknown[];
  if (ids.length > 100 || ids.some(id => typeof id !== 'string' || !/^MLA\d{5,25}$/u.test(id) || state.ids.includes(id)) || new Set(ids).size !== ids.length) throw editorialError('ML_EDITORIAL_SEARCH_INCOMPLETE');
  state.ids.push(...ids as string[]); state.seen += ids.length;
  if (state.ids.length > ML_EDITORIAL_MAX_ITEMS || state.seen > total) throw editorialError('ML_EDITORIAL_ITEM_LIMIT');
  if (state.seen === total) {
    state.searchStatus++; state.seen = 0; state.total = null; state.scroll = null;
    if (state.searchStatus === 2) {
      const links = await listEditorialLinks(database);
      state.metadataQueue = [...new Set([...state.ids, ...links.map(link => link.item_id)])];
      return state.metadataQueue.length === 0 ? 'content' : 'metadata';
    }
  } else {
    if (ids.length === 0 || typeof value.scroll_id !== 'string' || value.scroll_id.length > 4096 || value.scroll_id === '') throw editorialError('ML_EDITORIAL_SEARCH_INCOMPLETE');
    state.scroll = value.scroll_id;
  }
  return 'search';
}

async function metadataStep(database: D1Database, env: Env, state: EditorialRunState, now: string): Promise<EditorialRunRow['phase']> {
  const ids = state.metadataQueue.slice(state.metadataOffset, state.metadataOffset + 20);
  const value = await editorialApiGet(database, env, `/items/bulk?${new URLSearchParams({ ids: ids.join(',') })}`);
  if (!Array.isArray(value) || value.length !== ids.length) throw editorialError('ML_EDITORIAL_METADATA_INCOMPLETE');
  const seen = new Set<string>();
  for (const entry of value as unknown[]) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !ids.includes(entry.id) || seen.has(entry.id) || entry.status_code !== 200) throw editorialError('ML_EDITORIAL_METADATA_INCOMPLETE');
    seen.add(entry.id);
    const units = parseEditorialItem(entry.body);
    const first = units[0];
    if (first === undefined || first.itemId !== entry.id) throw editorialError('ML_EDITORIAL_METADATA_INCOMPLETE');
    if (state.ids.includes(entry.id) && !admittedEditorialStatus(first.status)) throw editorialError('ML_EDITORIAL_SEARCH_CHANGED');
    state.unitCount += units.length;
    if (state.unitCount > ML_EDITORIAL_MAX_UNITS) throw editorialError('ML_EDITORIAL_UNIT_LIMIT');
    state.itemHashes[entry.id] = await storeEditorialObject(database, 'item', { itemId: entry.id, sellerId: EDITORIAL_SELLER_ID, status: first.status, units }, now);
  }
  state.metadataOffset += ids.length;
  return state.metadataOffset === state.metadataQueue.length ? 'content' : 'metadata';
}

async function contentStep(database: D1Database, env: Env, state: EditorialRunState, now: string): Promise<EditorialRunRow['phase']> {
  const selected = state.links[state.contentOffset];
  if (selected === undefined) return 'publish';
  const link = (await listEditorialLinks(database)).find(link => link.cod_item === selected.code && link.revision === selected.revision);
  const finish = (issue?: string): EditorialRunRow['phase'] => {
    if (issue !== undefined) state.issues.push({ code: selected.code, reason: issue });
    state.contentOffset++; state.work = null; return state.contentOffset === state.links.length ? 'publish' : 'content';
  };
  if (link === undefined) return finish('association_changed');
  let identity;
  try { identity = await requireEditorialDuxIdentity(database, selected.code); }
  catch (error: unknown) { if (error instanceof HttpError && error.code === 'ML_EDITORIAL_DUX_PRODUCT_MISSING') return finish('dux_product_removed'); throw error; }
  if (JSON.stringify(identity) !== link.dux_identity_json) return finish('dux_identity_requires_review');
  const hash = state.itemHashes[link.item_id];
  if (hash === undefined) throw editorialError('ML_EDITORIAL_METADATA_INCOMPLETE');
  const item = await readEditorialObject<EditorialItemObject>(database, hash, 'item');
  if (item.sellerId !== EDITORIAL_SELLER_ID) throw editorialError('ML_EDITORIAL_SELLER_MISMATCH');
  if (!admittedEditorialStatus(item.status)) return finish('confirmed_listing_withdrawal');
  const unit = item.units.find(unit => (unit.variationId ?? '') === link.variation_id);
  if (unit === undefined) return finish('confirmed_variation_withdrawal');
  if (editorialSourceIdentity(unit) !== link.source_identity_json) return finish('source_identity_requires_review');
  if (state.work === null) {
    state.work = { code: selected.code, revision: selected.revision, pictureOffset: 0, images: [], description: null };
    if (link.description_approved === 1) {
      try {
        const value = await editorialApiGet(database, env, `/items/${link.item_id}/description`);
        if (!isRecord(value) || typeof value.plain_text !== 'string') throw editorialError('ML_EDITORIAL_DESCRIPTION_INVALID');
        state.work.description = transformEditorialDescription(value.plain_text);
      } catch (error: unknown) {
        // A missing description on a verified listing is an empty field, never a listing deletion.
        if (!(error instanceof MercadoLibreProviderError && error.providerStatus === 404)) throw error;
        state.work.description = transformEditorialDescription('');
      }
    }
    return 'content';
  }
  const work = state.work;
  if (work.code !== selected.code || work.revision !== selected.revision) throw editorialError('ML_EDITORIAL_STATE_INVALID');
  if (link.images_approved === 1 && work.pictureOffset < unit.pictures.length) {
    const pictures = unit.pictures.slice(work.pictureOffset, work.pictureOffset + 2);
    for (const picture of pictures) {
      const image = await importEditorialImage(env, picture, identity.name);
      if (image !== null && !work.images.some(current => current.sha256 === image.sha256)) work.images.push(image);
      if (image === null) state.issues.push({ code: selected.code, reason: 'invalid_or_missing_image' });
      work.pictureOffset++;
    }
    return 'content';
  }
  const contentHash = await storeEditorialObject(database, 'content', { code: selected.code,
    sellerId: EDITORIAL_SELLER_ID, itemId: unit.itemId, variationId: unit.variationId,
    duxIdentity: identity, sourceIdentity: link.source_identity_json, revision: selected.revision,
    images: work.images, description: work.description }, now);
  state.publications = { ...state.publications, [selected.code]: { hash: contentHash, revision: selected.revision } };
  return finish(work.description?.reviewLines.length ? 'description_requires_review' : undefined);
}
