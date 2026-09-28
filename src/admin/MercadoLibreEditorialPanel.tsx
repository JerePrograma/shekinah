import { useEffect, useRef, useState } from 'react';
import type { getEditorialReview } from '../../server/mercado-libre-editorial-review';
import type { editorialProgress } from '../../server/mercado-libre-editorial-sync';

type Review = Awaited<ReturnType<typeof getEditorialReview>>;
type Progress = ReturnType<typeof editorialProgress>;
type Status = {enabled:boolean;configured:boolean;connection:{connected:boolean};latest:Progress|null};

export function MercadoLibreEditorialPanel({onUnauthorized}:Readonly<{onUnauthorized?:(()=>void)|undefined}>) {
  const [status,setStatus]=useState<Status|null>(null),[progress,setProgress]=useState<Progress|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [refreshVersion,setRefreshVersion]=useState(0);
  const [code,setCode]=useState(''),[itemId,setItemId]=useState(''),[review,setReview]=useState<Review|null>(null);
  const [selected,setSelected]=useState(''),[reason,setReason]=useState('');
  const [presentation,setPresentation]=useState(false),[pack,setPack]=useState(false),[variant,setVariant]=useState(false);
  const [images,setImages]=useState(true),[description,setDescription]=useState(true);
  const mounted=useRef(true);
  const titleRef=useRef<HTMLHeadingElement>(null);
  async function api<T>(path:string,body?:unknown):Promise<T>{
    const response=await fetch(`/api/admin/mercadolibre/${path}`,{credentials:'same-origin',redirect:'error',
      ...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
    if(response.status===401)onUnauthorized?.();
    const value=await response.json() as T & {error?:{code?:string;message?:string}};
    if(!response.ok)throw Error(`${value.error?.code??''}: ${value.error?.message??'No se pudo completar la operación editorial.'}`);
    return value;
  }
  useEffect(()=>{
    mounted.current=true;
    setError('');
    void api<Status>('editorial/status').then(value=>{
      if(typeof value.enabled!=='boolean'||typeof value.configured!=='boolean'||typeof value.connection?.connected!=='boolean'||value.latest===undefined)throw Error('Estado editorial inválido.');
      if(mounted.current){setStatus(value);setProgress(value.latest);}})
      .catch((caught:unknown)=>{if(mounted.current)setError(caught instanceof Error?caught.message:'No se pudo leer el estado editorial.');});
    return()=>{mounted.current=false;};
  // The initial request is independent of stock updates and never starts an import.
  },[refreshVersion]);
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
      if(next.status==='succeeded'){setMessage('Contenido actualizado. Ya podés revisar los productos.');window.dispatchEvent(new Event('shekinah:admin-products-refresh'));return;}
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
    setMessage(decision==='approve'?'Publicación aprobada para este producto. Actualizá el contenido para aplicar los cambios.':decision==='reject'?'Publicación rechazada para este producto.':'Se retiró la autorización para usar esta publicación.');
    await loadReview();
  }
  return <section className="admin-context-note" aria-labelledby="ml-editorial-title">
    <h3 id="ml-editorial-title" ref={titleRef} tabIndex={-1}>Contenido de Mercado Libre</h3>
    <p>Usá las publicaciones activas de HERBOLARIOMDP para el nombre, las fotos y la descripción de los productos que apruebes. Los precios y las existencias se siguen administrando en Dux.</p>
    {status===null?(error===''?<p role="status">Consultando la conexión con Mercado Libre…</p>:null):!ready?<p role="status">{!status.enabled||!status.configured
      ?'La conexión con Mercado Libre necesita preparación. Contactá a soporte para habilitar esta función.'
      :'Falta autorizar la cuenta de HERBOLARIOMDP. El titular debe usar el botón de autorización para continuar.'} El contenido actual se conserva.</p>:<p>Cuenta conectada. Podés actualizar el contenido o revisar qué publicación corresponde a cada producto.</p>}
    {status?.enabled&&status.configured&&!status.connection.connected?<button type="button" disabled={busy} onClick={()=>void operation(async()=>{
      const result=await api<{authorizationUrl:string}>('authorize',{});const url=new URL(result.authorizationUrl);
      if(url.protocol!=='https:'||url.hostname!=='auth.mercadolibre.com.ar')throw Error('El retorno de autorización no es válido.');
      window.location.assign(url.href);
    })}>Autorizar cuenta de Mercado Libre</button>:null}
    <button type="button" disabled={!ready||busy} onClick={()=>void operation(synchronize)}>{busy?'Procesando contenido…':progress?.status==='running'?'Continuar actualización de contenido':'Actualizar contenido de los productos'}</button>
    {progress===null?null:<><p role="status">{progressMessage(progress)} Publicaciones revisadas: {progress.metadataCompleted} de {progress.metadataTotal}. Productos revisados: {progress.contentCompleted} de {progress.associations}.</p>
      {progress.issues.length===0?null:<p>{progress.issues.length} casos necesitan revisión. Consultá la información para soporte antes de aprobar nuevos contenidos.</p>}</>}
    <form onSubmit={event=>{event.preventDefault();void operation(loadReview);}}>
      <label>Código del producto en Dux<input value={code} onChange={event=>setCode(event.target.value)} required maxLength={180} disabled={!ready||busy}/></label>
      <label>Número de publicación de Mercado Libre (opcional)<input value={itemId} onChange={event=>setItemId(event.target.value)} maxLength={30} disabled={!ready||busy}/></label>
      <button type="submit" disabled={!ready||busy}>Buscar publicaciones para este producto</button>
    </form>
    {review===null?null:<div>
      <h4>{review.dux.name} · {review.dux.code}</h4>
      <p>Unidades por bulto en Dux: {review.dux.unitsPerPackage??'No informadas'}. Si no están informadas o figuran en cero, comprobá la presentación antes de aprobar.</p>
      <p>Comprobá que la publicación sea del mismo producto, presentación y cantidad. Coincidir en el código no alcanza.</p>
      {choices.length===0?<p>No encontramos publicaciones activas para revisar. Comprobá el código del producto o indicá el número de publicación y volvé a buscar.</p>:null}
      {review.candidates.some(candidate=>!candidate.unique)?<p>Hay varias coincidencias posibles. Revisá cada publicación antes de elegir.</p>:null}
      <label>Publicación y variante<select value={selected} onChange={event=>{setSelected(event.target.value);setPresentation(false);setPack(false);setVariant(false);}} disabled={busy}>
        <option value="">Elegir una publicación para revisar</option>
        {choices.map((value,index)=><option key={value.key} value={value.key}>{value.unit.title} — opción {index+1}</option>)}
      </select></label>
      {choice===undefined?null:<>
        <p>{choice.unit.status==='active'?'Publicación activa.':'Esta publicación no está activa. No la apruebes; actualizá el contenido y volvé a buscar.'} Fotos disponibles: {choice.unit.pictures.length}.</p>
        <ul>{choice.unit.attributes.map((attribute,index)=><li key={`${attribute.id}:${index}`}>{attributeLabel(attribute.id)}: {attribute.value}</li>)}</ul>
        <label><input type="checkbox" checked={presentation} onChange={event=>setPresentation(event.target.checked)} disabled={busy}/>Comprobé que es el mismo producto y presentación.</label>
        <label><input type="checkbox" checked={pack} onChange={event=>setPack(event.target.checked)} disabled={busy}/>Comprobé la cantidad y el contenido del paquete.</label>
        <label><input type="checkbox" checked={variant} onChange={event=>setVariant(event.target.checked)} disabled={busy}/>Comprobé la variante exacta, sin mezclar presentaciones.</label>
        <label><input type="checkbox" checked={images} onChange={event=>setImages(event.target.checked)} disabled={busy}/>Usar las fotos de esta variante.</label>
        <label><input type="checkbox" checked={description} onChange={event=>setDescription(event.target.checked)} disabled={busy}/>Usar la descripción de esta publicación.</label>
        <label>Qué comprobaste y por qué tomás esta decisión<textarea value={reason} onChange={event=>setReason(event.target.value)} maxLength={2000} disabled={busy}/></label>
        <p>Para aprobar, completá las tres comprobaciones, elegí fotos o descripción y escribí el motivo. El nombre de la publicación también se usará en la tienda.</p>
        <button type="button" disabled={busy||!presentation||!pack||!variant||(!images&&!description)||!reason.trim()} onClick={()=>void operation(()=>decide('approve'))}>Usar esta publicación para el producto</button>
        <button type="button" disabled={busy||!reason.trim()} onClick={()=>void operation(()=>decide('reject'))}>Rechazar esta publicación</button>
        <button type="button" disabled={busy||!reason.trim()||review.association===null} onClick={()=>void operation(()=>decide('revoke'))}>Dejar de usar esta publicación</button>
      </>}
    </div>}
    {message===''?null:<p role="status">{message}</p>}{error===''?null:<><p role="alert">{editorialErrorMessage(error)}</p>
      <button type="button" disabled={busy} onClick={()=>{titleRef.current?.focus();setRefreshVersion(value=>value+1);}}>Volver a consultar Mercado Libre</button></>}
    <details><summary>Información para soporte: Mercado Libre</summary>
      <p>Vendedor autorizado: HERBOLARIOMDP (445638367).</p>
      {progress===null?null:<><p>Actualización: {progress.id}. Estado: {progress.status}. Etapa: {progress.phase}.</p>
        {progress.errorCode===null||progress.errorCode===undefined?null:<p>{progress.errorCode}</p>}
        {progress.issues.length===0?null:<p>{JSON.stringify(progress.issues)}</p>}</>}
      {choice===undefined?null:<><p>Publicación: {choice.unit.itemId}. Variante: {choice.unit.variationId??'Sin variantes'}. SKU: {choice.unit.sku??'No informado'}. Estado: {choice.unit.status}.</p>
        <ul>{choice.unit.attributes.map((attribute,index)=><li key={`${attribute.id}:${index}`}>{attribute.id}: {attribute.value}</li>)}</ul></>}
      {error===''?null:<p>{error}</p>}
    </details>
  </section>;
}

function progressMessage(progress:Progress):string {
  if(progress.status==='succeeded')return 'Última actualización completada.';
  if(progress.status==='failed')return 'La última actualización no se completó. Revisá la conexión y volvé a actualizar.';
  const phases:Readonly<Record<string,string>>={search:'Buscando publicaciones activas.',metadata:'Revisando las publicaciones encontradas.',content:'Preparando los contenidos aprobados.',publish:'Guardando el contenido actualizado.',complete:'Actualización completada.'};
  return (Object.hasOwn(phases,progress.phase)?phases[progress.phase]:undefined)??'La actualización necesita revisión. Consultá a soporte.';
}

function attributeLabel(id:string):string {
  const labels:Readonly<Record<string,string>>={BRAND:'Marca',MODEL:'Modelo',COLOR:'Color',FLAVOR:'Sabor',NET_WEIGHT:'Peso neto',WEIGHT:'Peso',VOLUME:'Volumen',UNITS_PER_PACK:'Unidades por paquete',UNITS_PER_PACKAGE:'Unidades por paquete',UNIT_WEIGHT:'Peso por unidad',SALE_FORMAT:'Formato de venta',SELLER_SKU:'Código del vendedor',GTIN:'Código de barras',EAN:'Código de barras',UPC:'Código de barras'};
  return (Object.hasOwn(labels,id)?labels[id]:undefined)??'Característica de la publicación';
}

function editorialErrorMessage(detail:string):string {
  const messages:Readonly<Record<string,string>>={
    ML_EDITORIAL_INITIAL_IMPORT_REQUIRED:'Primero actualizá el contenido de los productos. Cuando termine, volvé a buscar la publicación.',
    ML_EDITORIAL_ITEM_INVALID:'Revisá el número de publicación de Mercado Libre y volvé a buscar.',
    ML_EDITORIAL_DUX_PRODUCT_MISSING:'No encontramos este producto en Dux. Comprobá su código y actualizá los productos de Dux antes de volver a buscar.',
    ML_EDITORIAL_DUX_VARIANT_AMBIGUOUS:'El producto tiene varias presentaciones posibles. Contactá a soporte para comprobar cuál corresponde antes de aprobar contenido.',
    ML_EDITORIAL_SOURCE_CHANGED:'La publicación cambió desde la última revisión. Actualizá el contenido y volvé a comprobar el producto antes de aprobar.',
    ML_EDITORIAL_DUX_IDENTITY_CHANGED:'El producto cambió en Dux. Volvé a buscarlo y comprobar su presentación antes de aprobar.',
    ML_EDITORIAL_REVIEW_CONFLICT:'La revisión cambió mientras trabajabas. Volvé a buscar el producto antes de guardar tu decisión.',
    ML_EDITORIAL_IDENTITY_REVIEW_REQUIRED:'Completá las tres comprobaciones y elegí fotos o descripción antes de aprobar.',
    ML_EDITORIAL_BUSY:'Hay una actualización en curso. Esperá unos momentos y volvé a consultar Mercado Libre.',
    ML_EDITORIAL_ALREADY_RUNNING:'Hay una actualización en curso. Volvé a consultar Mercado Libre para continuarla.',
    ML_EDITORIAL_DAILY_BUDGET:'Se alcanzó el límite diario de actualizaciones. Volvé a intentarlo mañana.',
    ML_EDITORIAL_SELLER_MISMATCH:'La cuenta conectada no es la de HERBOLARIOMDP. Contactá a soporte para revisar la autorización.',
    ML_EDITORIAL_CONTEXT_INVALID:'La conexión con Mercado Libre necesita revisión. Contactá a soporte para completar la preparación.',
    ML_EDITORIAL_APPLICATION_INVALID:'La conexión con Mercado Libre necesita revisión. Contactá a soporte para completar la preparación.',
  };
  const code=detail.split(':',1)[0]??'';
  return (Object.hasOwn(messages,code)?messages[code]:undefined)??'No pudimos completar la consulta o el cambio de contenido. Volvé a consultar el estado antes de repetir la acción. Si el problema continúa, contactá a soporte.';
}
