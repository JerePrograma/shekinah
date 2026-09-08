import { useEffect, useRef, useState } from 'react';
import type { getEditorialReview } from '../../server/mercado-libre-editorial-review';
import type { editorialProgress } from '../../server/mercado-libre-editorial-sync';

type Review = Awaited<ReturnType<typeof getEditorialReview>>;
type Progress = ReturnType<typeof editorialProgress>;
type Status = {enabled:boolean;configured:boolean;connection:{connected:boolean};latest:Progress|null};

export function MercadoLibreEditorialPanel({onUnauthorized}:Readonly<{onUnauthorized?:(()=>void)|undefined}>) {
  const [status,setStatus]=useState<Status|null>(null),[progress,setProgress]=useState<Progress|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [code,setCode]=useState(''),[itemId,setItemId]=useState(''),[review,setReview]=useState<Review|null>(null);
  const [selected,setSelected]=useState(''),[reason,setReason]=useState('');
  const [presentation,setPresentation]=useState(false),[pack,setPack]=useState(false),[variant,setVariant]=useState(false);
  const [images,setImages]=useState(true),[description,setDescription]=useState(true);
  const mounted=useRef(true);
  async function api<T>(path:string,body?:unknown):Promise<T>{
    const response=await fetch(`/api/admin/mercadolibre/${path}`,{credentials:'same-origin',redirect:'error',
      ...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
    if(response.status===401)onUnauthorized?.();
    const value=await response.json() as T & {error?:{message?:string}};
    if(!response.ok)throw Error(value.error?.message??'No se pudo completar la operación editorial.');
    return value;
  }
  useEffect(()=>{
    mounted.current=true;
    void api<Status>('editorial/status').then(value=>{
      if(typeof value.enabled!=='boolean'||typeof value.configured!=='boolean'||typeof value.connection?.connected!=='boolean'||value.latest===undefined)throw Error('Estado editorial inválido.');
      if(mounted.current){setStatus(value);setProgress(value.latest);}})
      .catch((caught:unknown)=>{if(mounted.current)setError(caught instanceof Error?caught.message:'No se pudo leer el estado editorial.');});
    return()=>{mounted.current=false;};
  // The initial request is independent of stock updates and never starts an import.
  },[]);
  const ready=status?.enabled===true&&status.configured&&status.connection.connected;
  async function operation(action:()=>Promise<void>){
    if(busy)return;setBusy(true);setError('');setMessage('');
    try{await action();}catch(caught:unknown){if(mounted.current)setError(caught instanceof Error?caught.message:'No se pudo completar la operación.');}
    finally{if(mounted.current)setBusy(false);}
  }
  async function synchronize(){
    let runId=progress?.status==='running'?progress.id:null;
    const deadline=Date.now()+45*60*1000;
    while(mounted.current&&Date.now()<deadline){
      const next=await api<Progress>('editorial/sync',{runId});if(!mounted.current)return;
      setProgress(next);runId=next.id;
      if(next.status==='succeeded'){setMessage('Importación editorial completa.');window.dispatchEvent(new Event('shekinah:admin-products-refresh'));return;}
      if(next.status!=='running')throw Error('La importación no se completó. Se conserva el contenido anterior.');
      await new Promise(resolve=>window.setTimeout(resolve,1000));
    }
    if(mounted.current)throw Error('Se alcanzó el tiempo de esta actualización. Podés consultar su estado y continuar.');
  }
  async function loadReview(){
    const query=new URLSearchParams({code});if(itemId.trim()!=='')query.set('itemId',itemId.trim());
    setReview(await api<Review>(`editorial/review?${query}`));setSelected('');setReason('');setPresentation(false);setPack(false);setVariant(false);
  }
  const choices=review?.sources.flatMap(source=>source.units.map(unit=>({source,unit,key:`${unit.itemId}:${unit.variationId??''}`})))??[];
  const choice=choices.find(value=>value.key===selected);
  async function decide(decision:'approve'|'reject'|'revoke'){
    if(review===null||choice===undefined)return;
    await api('editorial/review',{code:review.dux.code,itemId:choice.unit.itemId,variationId:choice.unit.variationId,
      evidenceHash:choice.source.hash,duxIdentityHash:review.duxIdentityHash,decision,reason,presentationVerified:presentation,packVerified:pack,variantVerified:variant,
      images,description,expectedRevision:review.association?.revision??0});
    setMessage(decision==='approve'?'Asociación registrada. Actualizá el contenido para importar los campos aprobados.':'Decisión registrada.');
    await loadReview();
  }
  return <section className="admin-context-note" aria-labelledby="ml-editorial-title">
    <h3 id="ml-editorial-title">Contenido de Mercado Libre para Dux</h3>
    <p>Fuente autorizada: HERBOLARIOMDP (445638367), publicaciones activas y pausadas. Dux conserva productos, precios y existencias.</p>
    {status===null?<p>Consultando conexión editorial…</p>:!ready?<p role="status">Conexión editorial pendiente. Se necesita una aplicación oficial de Mercado Libre y la autorización del titular de HERBOLARIOMDP. Se conserva el contenido local ya vinculado.</p>:<p>Conexión editorial disponible para lectura.</p>}
    {status?.enabled&&status.configured&&!status.connection.connected?<button type="button" disabled={busy} onClick={()=>void operation(async()=>{
      const result=await api<{authorizationUrl:string}>('authorize',{});const url=new URL(result.authorizationUrl);
      if(url.protocol!=='https:'||url.hostname!=='auth.mercadolibre.com.ar')throw Error('El retorno de autorización no es válido.');
      window.location.assign(url.href);
    })}>Autorizar cuenta de Mercado Libre</button>:null}
    <button type="button" disabled={!ready||busy} onClick={()=>void operation(synchronize)}>{busy?'Procesando contenido…':'Actualizar contenido editorial'}</button>
    {progress===null?null:<p role="status">Estado: {progress.status}. Etapa: {progress.phase}. Publicaciones: {progress.metadataCompleted}/{progress.metadataTotal}. Asociaciones procesadas: {progress.contentCompleted}/{progress.associations}. Incidencias: {progress.issues.length}.</p>}
    <form onSubmit={event=>{event.preventDefault();void operation(loadReview);}}>
      <label>Código Dux<input value={code} onChange={event=>setCode(event.target.value)} required maxLength={180} disabled={!ready||busy}/></label>
      <label>Publicación MLA opcional<input value={itemId} onChange={event=>setItemId(event.target.value)} maxLength={30} disabled={!ready||busy}/></label>
      <button type="submit" disabled={!ready||busy}>Revisar asociación</button>
    </form>
    {review===null?null:<div>
      <h4>{review.dux.name} · {review.dux.code}</h4>
      <p>Unidades por bulto informadas por Dux: {review.dux.unitsPerPackage??'No informadas'}. El valor cero no demuestra una presentación individual.</p>
      <p>{review.candidates.length} sugerencias por identificadores exactos. La coincidencia de código requiere comprobar presentación, pack y variante.</p>
      {review.candidates.some(candidate=>!candidate.unique)?<p>Hay identificadores ambiguos; no autorizan una asociación automática.</p>:null}
      <label>Publicación y variante<select value={selected} onChange={event=>{setSelected(event.target.value);setPresentation(false);setPack(false);setVariant(false);}} disabled={busy}>
        <option value="">Seleccionar una fuente para revisar</option>
        {choices.map(value=><option key={value.key} value={value.key}>{value.unit.itemId} · {value.unit.variationId??'Sin variantes'} · {value.unit.title}</option>)}
      </select></label>
      {choice===undefined?null:<>
        <p>Estado: {choice.unit.status}. SKU: {choice.unit.sku??'No informado'}. Fotos aplicables: {choice.unit.pictures.length}.</p>
        <ul>{choice.unit.attributes.map((attribute,index)=><li key={`${attribute.id}:${index}`}>{attribute.id}: {attribute.value}</li>)}</ul>
        <label><input type="checkbox" checked={presentation} onChange={event=>setPresentation(event.target.checked)} disabled={busy}/>Comprobé que es el mismo producto y presentación.</label>
        <label><input type="checkbox" checked={pack} onChange={event=>setPack(event.target.checked)} disabled={busy}/>Comprobé la cantidad y el contenido del pack.</label>
        <label><input type="checkbox" checked={variant} onChange={event=>setVariant(event.target.checked)} disabled={busy}/>Comprobé la variante exacta, sin mezclar presentaciones.</label>
        <label><input type="checkbox" checked={images} onChange={event=>setImages(event.target.checked)} disabled={busy}/>Usar imágenes válidas de esta variante.</label>
        <label><input type="checkbox" checked={description} onChange={event=>setDescription(event.target.checked)} disabled={busy}/>Usar descripción válida de esta publicación.</label>
        <label>Fundamento y evidencia de la decisión<textarea value={reason} onChange={event=>setReason(event.target.value)} maxLength={2000} disabled={busy}/></label>
        <button type="button" disabled={busy||!presentation||!pack||!variant||(!images&&!description)||!reason.trim()} onClick={()=>void operation(()=>decide('approve'))}>Aprobar asociación editorial</button>
        <button type="button" disabled={busy||!reason.trim()} onClick={()=>void operation(()=>decide('reject'))}>Rechazar asociación</button>
        <button type="button" disabled={busy||!reason.trim()||review.association===null} onClick={()=>void operation(()=>decide('revoke'))}>Retirar asociación vigente</button>
      </>}
    </div>}
    {message===''?null:<p role="status">{message}</p>}{error===''?null:<p role="alert">{error}</p>}
  </section>;
}
