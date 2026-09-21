import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { advanceDirectCheckout } from './direct-checkout';
import { createOrRecoverAssistedPreference } from './assisted-payment';
import { confirmAssistedDuxLifecycle, inspectAssistedDuxLifecycle } from './assisted-dux-lifecycle';
import { getWebRequestByToken, resolveWebOrderRequest } from './web-order-requests';
import { HttpError } from './http';
import { getOrderById, updateOrderFromPayment } from './orders';
import { readAssistedCheckoutAdminState } from './assisted-checkout-admin-state';
import type { DirectGateway } from './direct-checkout';
import type { DuxOrderEvidence, DuxOrderRequest } from './dux-order-api';
import type { Env } from './platform';
import { SqliteD1 } from './test/sqlite-d1';

const date = '2026-09-15T14:00:00.000Z';
const token = 'a'.repeat(64);
const id = `req_${'a'.repeat(24)}`;
const productId = 'dux-producto-a-0000000000000001';
const env: Env = { WEB_ORDERS_ENABLED: 'true', DIRECT_CHECKOUT_ENABLED: 'true', DUX_API_ENABLED: 'true',
  DUX_API_TOKEN: 'test-only-token', DUX_COMPANY_ID: '12862', DUX_BRANCH_ID: '1', DUX_DEPOSIT_ID: '25566',
  DUX_ORDER_PERSONAL_ID: '7', DUX_ORDER_CUSTOMER_ID: '8' };
const item = { code: 'A-001', name: 'Producto Dux vigente', priceMinor: 350000, vatPercent: 21,
  realStock: 12.68, reservedStock: 0, availableStock: 12.68 };
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }

function setup(quantity = 2, maxMigration = '0024') {
  const db = new SqliteD1(readdirSync(resolve('migrations')).filter(name => /^\d{4}_.*\.sql$/u.test(name) && name.slice(0, 4) <= maxMigration)
    .sort().map(name => readFileSync(resolve('migrations', name), 'utf8')).join('\n'));
  const raw = db.database;
  raw.prepare(`INSERT INTO dux_tenant_context (id, api_version, company_id, company_name, branch_id, branch_name,
    deposit_id, deposit_name, verified_at, updated_at) VALUES (1,'v2','12862','Prueba','1','Prueba','25566','Prueba',?,?)`).run(date,date);
  raw.prepare(`UPDATE dux_catalog_control SET snapshot_collection_enabled=1, updated_by='test', updated_at=?`).run(date);
  raw.prepare(`INSERT INTO dux_sync_runs (id,kind,status,trigger_actor,processed_count,mapped_count,unmapped_count,
    ambiguous_count,absent_count,failed_count,started_at,completed_at,created_at,updated_at)
    VALUES ('dux_sync_direct_test','manual','succeeded','test',1,0,1,0,0,0,?,?,?,?)`).run(date,date,date,date);
  const payload = JSON.stringify({ schemaVersion:2,priceListName:'PRECIOS DEL NEGOCIO',items:[{
    slug:productId,code:'A-001',name:'Precio viejo',priceAmount:100,priceStatus:'usable',categories:[],unitsPerPackage:null,imageUrl:null,description:null }] });
  raw.prepare(`INSERT INTO dux_catalog_snapshots_v2 (id,inventory_run_id,catalog_version,price_list_name,item_count,
    payload_json,synced_at,created_at,updated_at) VALUES (1,'dux_sync_direct_test',?,'PRECIOS DEL NEGOCIO',1,?,?,?,?)`)
    .run(hash(payload),payload,date,date,date);
  raw.prepare(`UPDATE dux_catalog_control SET public_catalog_enabled=1,updated_by='test',updated_at=?`).run(date);
  const snapshot = { schemaVersion:1,catalogVersion:hash(payload),observedAt:date,
    lines:[{productId,duxCode:'A-001',name:'Precio viejo',requestedQuantity:quantity,observedUnitPriceMinor:10000}],
    fulfillment:{method:'coordinated_pickup',fullName:'PRUEBA DIRECTA',phone:'5491100000000',address:'',locality:'',province:'',postalCode:''},
    totalMinor:null,shippingMinor:0,quantityStatus:'requires_confirmation' };
  raw.prepare(`INSERT INTO checkout_intents (checkout_idempotency_key,fulfillment_fingerprint,cart_fingerprint,created_at,
    intent_kind,web_request_id,web_request_token_hash,web_request_owner_hash,web_request_fingerprint,web_request_json,web_request_status,web_request_updated_at)
    VALUES (?,'fulfillment','cart',?,'web_request',?,?,?,?,?,'submitted',?)`)
    .run(crypto.randomUUID(),date,id,hash(token),'b'.repeat(64),'c'.repeat(64),JSON.stringify(snapshot),date);
  let providerOrder: DuxOrderEvidence | null = null;
  const readItem = vi.fn(() => Promise.resolve(providerOrder === null ? item : { ...item, reservedStock:quantity, availableStock:item.realStock-quantity }));
  const createOrder = vi.fn(async (request: DuxOrderRequest, beforeSend?: () => Promise<void>) => {
    await beforeSend?.();
    providerOrder = { id:100,number:200,companyId:12862,branchId:1,reference:request.referencia,cancelled:false,
      totalMinor:item.priceMinor*quantity,invoiceState:'PENDIENTE',deliveryState:'PENDIENTE',
      lines:request.items.map(line=>({code:line.cod_item,quantity:line.ctd,unitPrice:line.precio_uni,vatPercent:line.porc_iva,discountPercent:0,variantId:null})) };
    return providerOrder;
  });
  const findOrder = vi.fn(() => Promise.resolve(providerOrder));
  const gateway: DirectGateway = {readItem,createOrder,findOrder};
  let clock = Date.parse(date);
  const advance = () => advanceDirectCheckout(db,env,token,{gateway,now:()=>clock});
  const steps = async (count: number) => {for(let i=0;i<count;i+=1) await advance();};
  return {db,advance,steps,readItem,createOrder,findOrder,gateway,setClock:(value:number)=>{clock=value;}};
}

it('prepara automáticamente con precio vivo, stock decimal, total final y una sola reserva', async () => {
  const test=setup(12);
  try {
    await test.steps(6);
    expect(await readAssistedCheckoutAdminState(test.db,env,id)).toMatchObject({state:'prepared',prepared:{reservationStatus:'confirmed',totalMinor:4200000}});
    expect(test.createOrder).toHaveBeenCalledTimes(1);
    expect(test.findOrder).toHaveBeenCalledTimes(2);
    expect(test.readItem).toHaveBeenCalledTimes(2);
    expect(await test.db.prepare('SELECT total_minor,mp_preference_id FROM orders').first()).toEqual({total_minor:4200000,mp_preference_id:null});
    expect(await test.db.prepare('SELECT verification_method,reservation_state FROM dux_order_links').first()).toEqual({verification_method:'automatic_api',reservation_state:'confirmed'});
    expect(await test.db.prepare('SELECT direct_checkout_state FROM checkout_intents').first()).toEqual({direct_checkout_state:'prepared'});
    expect((await test.db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    await test.steps(2);
    expect(test.createOrder).toHaveBeenCalledTimes(1);
  } finally {test.db.close();}
});

it('recupera el pedido que Dux normalizó a mayúsculas y verifica stock sin reenviar la creación', async () => {
  const test = setup();
  try {
    await test.steps(3);
    const created = await test.findOrder();
    if (created === null) throw new Error('Falta el pedido de la prueba');
    test.findOrder.mockResolvedValue({ ...created, reference: created.reference.toUpperCase() });
    await test.steps(5);
    expect(await readAssistedCheckoutAdminState(test.db, env, id))
      .toMatchObject({ state: 'prepared', prepared: { reservationStatus: 'confirmed', totalMinor: 700000 } });
    expect(test.createOrder).toHaveBeenCalledTimes(1);
    expect(test.readItem).toHaveBeenCalledTimes(2);
    expect(await test.db.prepare('SELECT dux_reference FROM dux_order_links').first())
      .toEqual({ dux_reference: `shekinah:web:${id}` });
    expect(await test.db.prepare("SELECT json_extract(response_json, '$.order.reference') AS reference, json_extract(response_json, '$.providerReference') AS providerReference FROM dux_order_operations").first())
      .toEqual({ reference: `shekinah:web:${id}`, providerReference: `shekinah:web:${id}`.toUpperCase() });
  } finally { test.db.close(); }
});

it('cierra idempotentemente una consulta Dux fallida sin orden, reserva ni pago y conserva el error', async () => {
  const test = setup();
  try {
    test.readItem.mockRejectedValueOnce(new HttpError(503, 'DUX_ORDER_QUERY_UNAVAILABLE', 'Dux no disponible'));
    await expect(test.advance()).rejects.toMatchObject({ code: 'DUX_ORDER_QUERY_UNAVAILABLE' });
    const results = await Promise.all(Array.from({ length: 4 }, () => resolveWebOrderRequest(test.db, id, 'rejected', 'admin:test')));
    expect(results.filter(result => result.changed)).toHaveLength(1);
    expect(await getWebRequestByToken(test.db, token, true, Date.now(), true))
      .toMatchObject({ status: 'rejected', preparationStatus: 'failed', totalMinor: null, checkoutAvailable: false });
    expect(await test.db.prepare('SELECT direct_checkout_error_code, direct_checkout_claim_token FROM checkout_intents').first())
      .toEqual({ direct_checkout_error_code: 'DUX_ORDER_QUERY_UNAVAILABLE', direct_checkout_claim_token: null });
    await test.steps(2);
    expect(test.readItem).toHaveBeenCalledTimes(1);
    expect(test.createOrder).not.toHaveBeenCalled();
    for (const table of ['orders', 'dux_order_links', 'dux_order_operations', 'payments']) {
      expect(test.db.database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get()?.total).toBe(0);
    }
  } finally { test.db.close(); }
});

it('no permite aceptar ni rechazar manualmente una preparación mientras mantiene un lease activo', async () => {
  const test = setup();
  let finishRead: () => void = () => undefined;
  let notifyStarted: () => void = () => undefined;
  const started = new Promise<void>(resolve => { notifyStarted = resolve; });
  const pendingRead = new Promise<void>(resolve => { finishRead = resolve; });
  test.setClock(Date.now());
  test.readItem.mockImplementationOnce(async () => { notifyStarted(); await pendingRead; return item; });
  const advancing = test.advance();
  try {
    await started;
    for (const status of ['accepted', 'rejected'] as const) {
      await expect(resolveWebOrderRequest(test.db, id, status, 'admin:test')).rejects.toMatchObject({ status: 409 });
    }
    finishRead();
    await advancing;
    await expect(resolveWebOrderRequest(test.db, id, 'accepted', 'admin:test')).rejects.toMatchObject({ status: 409 });
    expect((await resolveWebOrderRequest(test.db, id, 'rejected', 'admin:test')).changed).toBe(true);
    expect(test.createOrder).not.toHaveBeenCalled();
  } finally { finishRead(); await advancing.catch(() => undefined); test.db.close(); }
});

it('un rechazo tras vencer el lease invalida el GET demorado y no deja que reabra la compra', async () => {
  const test = setup();
  let finishRead: () => void = () => undefined;
  let notifyStarted: () => void = () => undefined;
  const started = new Promise<void>(resolve => { notifyStarted = resolve; });
  const pendingRead = new Promise<void>(resolve => { finishRead = resolve; });
  test.setClock(Date.now() - 61_000);
  test.readItem.mockImplementationOnce(async () => { notifyStarted(); await pendingRead; return item; });
  const advancing = test.advance();
  try {
    await started;
    await resolveWebOrderRequest(test.db, id, 'rejected', 'admin:test');
    finishRead();
    await expect(advancing).rejects.toMatchObject({ code: 'DIRECT_CHECKOUT_IN_PROGRESS' });
    await test.advance();
    expect(await getWebRequestByToken(test.db, token, true, Date.now(), true))
      .toMatchObject({ status: 'rejected', preparationStatus: 'failed', checkoutAvailable: false });
    expect(test.createOrder).not.toHaveBeenCalled();
  } finally { finishRead(); await advancing.catch(() => undefined); test.db.close(); }
});

it.each([2, 3, 6])('no usa el rechazo de solicitud para cerrar una compra que ya avanzó %s pasos con una orden', async (steps) => {
  const test = setup();
  try {
    await test.steps(steps);
    await expect(resolveWebOrderRequest(test.db, id, 'rejected', 'admin:test')).rejects.toMatchObject({ status: 409 });
    expect((await getWebRequestByToken(test.db, token, true, Date.now(), true)).status).toBe('accepted');
    expect(test.createOrder.mock.calls.length).toBe(steps < 3 ? 0 : 1);
  } finally { test.db.close(); }
});

it('una respuesta demorada no confirma con un lease vencido y se recupera sin otro POST', async () => {
  const test = setup();
  try {
    await test.steps(5);
    const original = test.findOrder.getMockImplementation();
    test.findOrder.mockImplementationOnce(async () => {
      test.setClock(Date.parse(date) + 61_000);
      return await original?.() ?? null;
    });
    await expect(test.advance()).rejects.toMatchObject({code:'DIRECT_CHECKOUT_IN_PROGRESS'});
    expect(await test.db.prepare('SELECT reservation_state FROM dux_order_links').first()).toEqual({reservation_state:'pending'});
    await test.advance();
    expect(await test.db.prepare('SELECT reservation_state FROM dux_order_links').first()).toEqual({reservation_state:'confirmed'});
    expect(test.createOrder).toHaveBeenCalledTimes(1);
  } finally { test.db.close(); }
});

it('cierra sólo el borrador vencido que nunca intentó crear una reserva', async () => {
  const test = setup();
  try {
    await test.steps(2);
    expect(await readAssistedCheckoutAdminState(test.db,env,id)).toMatchObject({state:'direct_preparing',preparationStatus:'preparing'});
    test.setClock(Date.parse(date) + 901_000);
    await test.advance();
    expect(test.createOrder).not.toHaveBeenCalled();
    expect(await test.db.prepare('SELECT status FROM orders').first()).toEqual({status:'failed'});
    expect(await getWebRequestByToken(test.db,token,true,Date.now(),true))
      .toMatchObject({preparationStatus:'failed',totalMinor:null,checkoutAvailable:false});
  } finally { test.db.close(); }
});

it('una anulación posterior a la primera consulta Dux bloquea la confirmación', async () => {
  const test = setup();
  try {
    await test.steps(5);
    const original = test.findOrder.getMockImplementation();
    test.findOrder.mockImplementation(async () => { const order = await original?.(); return order ? {...order,cancelled:true} : null; });
    await expect(test.advance()).rejects.toMatchObject({code:'DIRECT_CHECKOUT_EVIDENCE_INVALID'});
    expect(await test.db.prepare('SELECT reservation_state FROM dux_order_links').first()).toEqual({reservation_state:'pending'});
  } finally { test.db.close(); }
});

it('una pausa obliga a releer el stock reservado sin reenviar la orden Dux', async () => {
  const test = setup();
  try {
    await test.steps(5);
    test.setClock(Date.parse(date) + 901_000);
    await test.steps(3);
    expect(test.createOrder).toHaveBeenCalledTimes(1);
    expect(test.readItem).toHaveBeenCalledTimes(3);
    expect(await test.db.prepare('SELECT reservation_state FROM dux_order_links').first()).toEqual({reservation_state:'confirmed'});
  } finally { test.db.close(); }
});

function paymentGateway() {
  return { create:vi.fn().mockResolvedValue({id:'pref-direct-test',checkoutUrl:'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-direct-test'}),
    recover:vi.fn().mockResolvedValue(null) };
}
const paymentDependencies = { accessToken:'TEST-'+'1'.repeat(20),mode:'sandbox' as const,siteUrl:new URL('https://example.test'),allowAutomatic:true };

it('Mercado Pago exige reserva confirmada, respeta el cierre del flag y reutiliza una sola preferencia', async () => {
  const test = setup(); const provider = paymentGateway();
  try {
    await test.steps(2);
    await expect(createOrRecoverAssistedPreference(test.db,token,paymentDependencies,provider)).rejects.toMatchObject({status:409});
    expect(provider.create).not.toHaveBeenCalled();
    await test.steps(4);
    await expect(createOrRecoverAssistedPreference(test.db,token,{...paymentDependencies,allowAutomatic:false},provider)).rejects.toMatchObject({code:'DIRECT_CHECKOUT_DISABLED',status:503});
    const first = await createOrRecoverAssistedPreference(test.db,token,paymentDependencies,provider);
    const repeated = await createOrRecoverAssistedPreference(test.db,token,paymentDependencies,provider);
    expect(first).toMatchObject({totalMinor:700000,created:true});
    expect(repeated).toMatchObject({totalMinor:700000,created:false,checkoutUrl:first.checkoutUrl});
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(provider.create.mock.calls[0]?.[0]).toMatchObject({cart:{totalMinor:700000}});
    await expect(inspectAssistedDuxLifecycle(test.db,first.orderId,'release')).rejects.toMatchObject({code:'ASSISTED_RELEASE_PAYMENT_WINDOW_ACTIVE'});
  } finally { test.db.close(); }
});

it('el flujo soportado libera la reserva automática sin pago, conserva evidencia y es idempotente', async () => {
  const test = setup();
  try {
    await test.steps(6);
    const order = await test.db.prepare('SELECT id FROM orders').first<{id:string}>();
    if (!order) throw new Error('missing test order');
    expect(await inspectAssistedDuxLifecycle(test.db,order.id,'release')).toMatchObject({requiresPaymentReconciliation:false});
    expect(await confirmAssistedDuxLifecycle(test.db,order.id,'release','admin:test',null)).toMatchObject({changed:true,reservationStatus:'released'});
    expect(await confirmAssistedDuxLifecycle(test.db,order.id,'release','admin:test',null)).toMatchObject({changed:false});
    await expect(createOrRecoverAssistedPreference(test.db,token,paymentDependencies,paymentGateway())).rejects.toMatchObject({status:409});
  } finally { test.db.close(); }
});

it('la ausencia de un guard 0024 cierra también el botón público y Mercado Pago', async () => {
  const test = setup(); const provider = paymentGateway();
  try {
    await test.steps(6);
    test.db.database.exec('DROP TRIGGER dux_automatic_release_financial_guard');
    expect(await getWebRequestByToken(test.db,token,true,Date.now(),true)).toMatchObject({checkoutAvailable:false});
    await expect(createOrRecoverAssistedPreference(test.db,token,paymentDependencies,provider)).rejects.toMatchObject({code:'DIRECT_CHECKOUT_MIGRATION_REQUIRED'});
    expect(provider.create).not.toHaveBeenCalled();
  } finally { test.db.close(); }
});

it('proyecta el pago autoritativo, impide liberar uno aprobado y permite finalizar sin degradar el cobro', async () => {
  const test=setup();
  try {
    await test.steps(6);
    const preference=await createOrRecoverAssistedPreference(test.db,token,paymentDependencies,paymentGateway());
    const order=await getOrderById(test.db,preference.orderId);
    if(!order) throw new Error('missing order');
    const now = new Date();
    const payment={id:'payment-direct-test',status:'approved',statusDetail:'accredited',amountMinor:700000,currency:'ARS',
      externalReference:order.id,approvedAt:now.toISOString(),updatedAt:now.toISOString()};
    await updateOrderFromPayment(test.db,order,payment,'approved','direct-approved');
    await updateOrderFromPayment(test.db,order,{...payment,status:'in_process'},'pending','direct-late-pending');
    expect(await getWebRequestByToken(test.db,token,true,Date.now(),true)).toMatchObject({paymentStatus:'approved',checkoutAvailable:false,paymentRequiresReview:false});
    await expect(confirmAssistedDuxLifecycle(test.db,order.id,'release','admin:test',now,new Date(now.getTime()+1_801_000)))
      .rejects.toMatchObject({code:'ASSISTED_RELEASE_PAYMENT_BLOCKED'});
    expect(await confirmAssistedDuxLifecycle(test.db,order.id,'finalize','admin:test',now,now)).toMatchObject({reservationStatus:'finalized',paymentStatus:'approved'});
    expect((await getOrderById(test.db,order.id))?.status).toBe('approved');
  } finally {test.db.close();}
});

it('rechaza trece unidades cuando Dux informa 12,68 sin crear pedido ni pago', async () => {
  const test=setup(13);
  try {
    await expect(test.advance()).rejects.toMatchObject({code:'DIRECT_STOCK_INSUFFICIENT'});
    expect(test.createOrder).not.toHaveBeenCalled();
    expect(await test.db.prepare('SELECT COUNT(*) AS n FROM orders').first()).toEqual({n:0});
  } finally {test.db.close();}
});

it('recupera por referencia un POST cuya respuesta se perdió y nunca lo reenvía', async () => {
  const test=setup();
  try {
    const create = test.createOrder.getMockImplementation();
    test.createOrder.mockImplementationOnce(async (request,beforeSend)=> {
      if(create===undefined) throw new Error('missing test gateway');
      await create(request,beforeSend); throw new Error('timeout after remote commit');
    });
    await test.steps(3);
    expect(await test.db.prepare('SELECT reservation_state FROM dux_order_links').first()).toEqual({reservation_state:'uncertain'});
    await test.steps(3);
    expect(test.createOrder).toHaveBeenCalledTimes(1);
    expect(await test.db.prepare('SELECT reservation_state FROM dux_order_links').first()).toEqual({reservation_state:'confirmed'});
  } finally {test.db.close();}
});

it('una búsqueda vacía después del POST no autoriza otra reserva', async () => {
  const test=setup();
  try {
    await test.steps(3);
    test.findOrder.mockResolvedValue(null);
    await test.steps(3);
    expect(test.createOrder).toHaveBeenCalledTimes(1);
    expect(await test.db.prepare('SELECT reservation_state FROM dux_order_links').first()).toEqual({reservation_state:'uncertain'});
  } finally {test.db.close();}
});

it('solicitudes concurrentes no repiten lecturas ni el POST reclamado', async () => {
  const test=setup();
  try {
    await Promise.all([test.advance(),test.advance()]);
    expect(test.readItem).toHaveBeenCalledTimes(1);
    await test.advance();
    await Promise.all([test.advance(),test.advance()]);
    expect(test.createOrder).toHaveBeenCalledTimes(1);
  } finally {test.db.close();}
});

it('sin 0024 falla antes de cualquier consulta o reserva en Dux', async () => {
  const test=setup(2,'0023');
  try {
    await expect(test.advance()).rejects.toMatchObject({code:'DIRECT_CHECKOUT_MIGRATION_REQUIRED'});
    expect(test.readItem).not.toHaveBeenCalled();
  } finally {test.db.close();}
});

it('un ID Dux sin efecto físico de reserva no habilita el cobro', async () => {
  const test=setup();
  try {
    await test.steps(4);
    test.readItem.mockResolvedValue(item);
    await expect(test.advance()).rejects.toMatchObject({code:'DIRECT_RESERVATION_UNVERIFIED'});
    await expect(test.db.prepare("UPDATE orders SET mp_preference_id='test',mp_checkout_url='https://www.mercadopago.com.ar/checkout'").run()).rejects.toThrow('RESERVATION_REQUIRED');
  } finally {test.db.close();}
});

it('conserva el intento y su historial e impide fabricar confirmación o reiniciar el POST', async () => {
  const test=setup();
  try {
    await test.steps(3);
    await expect(test.db.prepare('UPDATE dux_order_operations SET attempted_at=NULL').run()).rejects.toThrow('DUX_AUTOMATIC_ATTEMPT_INVALID');
    await expect(test.db.prepare('DELETE FROM dux_order_operations').run()).rejects.toThrow('DUX_AUTOMATIC_HISTORY_IMMUTABLE');
    await expect(test.db.prepare("UPDATE dux_order_operations SET status='confirmed'").run()).rejects.toThrow('DUX_AUTOMATIC_RESERVATION_EVIDENCE_REQUIRED');
    await expect(test.db.prepare("UPDATE dux_order_links SET dux_reference='another'").run()).rejects.toThrow('DUX_AUTOMATIC_IDENTITY_IMMUTABLE');
  } finally {test.db.close();}
});
