import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listMarketingCampaigns, parseMarketingCampaignInput, readMarketingQuote, readPublicMarketing,
  reserveMarketingRedemptionStatements, writeMarketingCampaign } from './marketing';
import type { MarketingCampaignInput } from '../src/commerce/marketing-contracts';
import { SqliteD1 } from './test/sqlite-d1';

const date = '2026-10-22T12:00:00.000Z';
const now = new Date(date);
const base: MarketingCampaignInput = { type:'automatic',title:'Prueba privada',body:'',ctaLabel:'',href:'',placement:'home',
  priority:0,enabled:true,startsAt:null,endsAt:null,percentOff:10,code:null,minSubtotalMinor:0,maxDiscountMinor:null,
  productCodes:[],maxRedemptions:null };
const lines = [{ productId:'dux-a',code:'A-001',quantity:3,unitPriceMinor:101 },
  { productId:'dux-b',code:'B-001',quantity:2,unitPriceMinor:250 }];
const migration = readFileSync(resolve('migrations/0028_marketing.sql'),'utf8');
function setup() { return new SqliteD1(`PRAGMA foreign_keys = ON; CREATE TABLE orders(id TEXT PRIMARY KEY); ${migration}`); }

it('nace vacío y sin efectos sobre precios ni stock', async () => {
  const db = setup();
  try {
    expect(await listMarketingCampaigns(db)).toEqual([]);
    expect(await readPublicMarketing(db,now)).toEqual({announcements:[],promotions:[]});
    const quote = await readMarketingQuote(db,lines,undefined,now);
    expect(quote).toMatchObject({campaignId:null,subtotalMinor:803,discountMinor:0,totalMinor:803});
    expect(reserveMarketingRedemptionStatements(db,'order',quote,date)).toEqual([]);
  } finally { db.close(); }
});

it('elige el mejor beneficio sin acumular y redondea por unidad', async () => {
  const db = setup();
  try {
    await writeMarketingCampaign(db,base,undefined,now);
    const coupon = await writeMarketingCampaign(db,{...base,type:'coupon',code:'  bienvenida  ',percentOff:20},undefined,now);
    expect(coupon.code).toBe('BIENVENIDA');
    const quote = await readMarketingQuote(db,lines,' bienvenida ',now);
    expect(quote).toMatchObject({campaignId:coupon.id,couponCode:'BIENVENIDA',subtotalMinor:803,discountMinor:160,totalMinor:643});
    expect(quote.lines.map(line => line.unitPriceMinor)).toEqual([81,200]);
    await writeMarketingCampaign(db,{...base,percentOff:25},undefined,now);
    expect(await readMarketingQuote(db,lines,'BIENVENIDA',now)).toMatchObject({couponCode:null,discountMinor:201});
  } finally { db.close(); }
});

it('aplica elegibilidad por código exacto y mínimo sobre subtotal de productos', async () => {
  const db = setup();
  try {
    await writeMarketingCampaign(db,{...base,type:'coupon',code:'PRUEBA',productCodes:['A-001'],minSubtotalMinor:803},undefined,now);
    expect(await readMarketingQuote(db,lines,'PRUEBA',now)).toMatchObject({discountMinor:30});
    await expect(readMarketingQuote(db,[lines[1]!],'PRUEBA',now)).rejects.toMatchObject({code:'COUPON_NOT_APPLICABLE'});
    await expect(readMarketingQuote(db,[{...lines[0]!,code:'a-001'}],'PRUEBA',now)).rejects.toMatchObject({code:'COUPON_NOT_APPLICABLE'});
  } finally { db.close(); }
});

it('reparte un tope en orden estable sin duplicar SKU ni superar el tope', async () => {
  const db = setup();
  try {
    await writeMarketingCampaign(db,{...base,percentOff:50,maxDiscountMinor:103},undefined,now);
    const quote = await readMarketingQuote(db,lines,null,now);
    expect(quote.discountMinor).toBe(102);
    expect(quote.lines).toHaveLength(2);
    expect(quote.lines.map(line=>line.quantity)).toEqual([3,2]);
    const reversed = await readMarketingQuote(db,[...lines].reverse(),null,now);
    expect(reversed.discountMinor).toBe(102);
    expect(reversed.lines.find(line=>line.code==='A-001')?.unitPriceMinor).toBe(quote.lines[0]?.unitPriceMinor);
  } finally { db.close(); }
});

it('jamás deja precios cero, y un cupón sin descuento representable se rechaza', async () => {
  const db = setup();
  try {
    await writeMarketingCampaign(db,{...base,type:'coupon',code:'CENTAVO',percentOff:90},undefined,now);
    await expect(readMarketingQuote(db,[{productId:'a',code:'A',quantity:1,unitPriceMinor:1}],'CENTAVO',now))
      .rejects.toMatchObject({code:'COUPON_NOT_APPLICABLE'});
  } finally { db.close(); }
});

it('programa anuncios y no revela códigos privados en GET público', async () => {
  const db = setup();
  try {
    await writeMarketingCampaign(db,{...base,type:'coupon',code:'SECRETO'},undefined,now);
    await writeMarketingCampaign(db,{...base,type:'announcement',percentOff:null,title:'Visible',href:'/productos',ctaLabel:'Ver'},undefined,now);
    await writeMarketingCampaign(db,{...base,type:'announcement',percentOff:null,title:'Futuro',startsAt:'2026-10-23T00:00:00.000Z'},undefined,now);
    await writeMarketingCampaign(db,{...base,type:'announcement',percentOff:null,title:'Vencido',endsAt:date},undefined,now);
    await writeMarketingCampaign(db,{...base,enabled:false},undefined,now);
    const result = await readPublicMarketing(db,now);
    expect(result.announcements.map(item=>item.title)).toEqual(['Visible']);
    expect(result.promotions).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('SECRETO');
  } finally { db.close(); }
});

it.each(['NOEXISTE','-INVALIDO','ab','Sß-123','💸💸💸'])('rechaza cupón explícito inválido %s aun con automática válida', async code => {
  const db = setup();
  try {
    await writeMarketingCampaign(db,base,undefined,now);
    await expect(readMarketingQuote(db,lines,code,now)).rejects.toMatchObject({code:'INVALID_COUPON'});
  } finally { db.close(); }
});

it.each([{enabled:false},{startsAt:'2026-10-23T00:00:00.000Z'},{endsAt:date}])('rechaza cupón fuera de vigencia %#', async fields => {
  const db = setup();
  try {
    await writeMarketingCampaign(db,{...base,type:'coupon',code:'PRUEBA',...fields},undefined,now);
    await expect(readMarketingQuote(db,lines,'PRUEBA',now)).rejects.toMatchObject({code:'INVALID_COUPON'});
  } finally { db.close(); }
});

it.each([
  {percentOff:0},{percentOff:91},{percentOff:10.5},{priority:1001},{minSubtotalMinor:-1},{maxDiscountMinor:0},
  {maxRedemptions:0},{productCodes:['A','A']},{productCodes:['']},{href:'https://other.test',ctaLabel:'Ver'},
  {href:'//other.test',ctaLabel:'Ver'},{href:'/\\evil.test',ctaLabel:'Ver'},{href:'/%2f%2fevil.test',ctaLabel:'Ver'},
  {href:'/hola%0a',ctaLabel:'Ver'},{ctaLabel:'Sin enlace'},{startsAt:date,endsAt:date},{startsAt:'2026-10-22'},
  {enabled:1},{redemptionCount:0},{unexpected:true},{type:'coupon',code:'-CODIGO'},{type:'coupon',code:'Sß-123'},
  {type:'announcement',percentOff:null,minSubtotalMinor:10},
])('valida estrictamente campos de campañas %#', fields => {
  expect(()=>parseMarketingCampaignInput({...base,...fields},now)).toThrow();
});

it('normaliza código y rechaza códigos ya usados; actualiza sin reiniciar contador', async () => {
  const db = setup();
  try {
    const campaign = await writeMarketingCampaign(db,{...base,type:'coupon',code:'PRUEBA'},undefined,now);
    await expect(writeMarketingCampaign(db,{...base,type:'coupon',code:'prueba'},undefined,now)).rejects.toMatchObject({code:'COUPON_CODE_EXISTS'});
    const quote = await readMarketingQuote(db,lines,'PRUEBA',now);
    await db.batch([db.prepare("INSERT INTO orders VALUES ('one')"),...reserveMarketingRedemptionStatements(db,'one',quote,date)]);
    expect(await writeMarketingCampaign(db,{...base,type:'coupon',code:'PRUEBA',title:'Editada'},campaign.id,now)).toMatchObject({title:'Editada',redemptionCount:1});
  } finally { db.close(); }
});

it.each(['automatic','announcement'] as const)('recupera alta %s idempotente sin duplicar tras respuesta perdida', async type => {
  const db = setup();
  try {
    const key = crypto.randomUUID();
    const input = {...base,type,percentOff:type==='announcement'?null:base.percentOff};
    const first = await writeMarketingCampaign(db,input,undefined,now,key);
    const recovered = await writeMarketingCampaign(db,input,undefined,new Date('2026-10-22T12:01:00.000Z'),key.toUpperCase());
    expect(recovered).toEqual(first);
    expect(first.id).toBe(`mkt_${key.replaceAll('-','')}`);
    expect(await db.prepare('SELECT count(*) AS count FROM marketing_campaigns').first()).toEqual({count:1});
    await expect(writeMarketingCampaign(db,{...input,title:'Cambio después de respuesta incierta'},undefined,now,key))
      .rejects.toMatchObject({status:409,code:'MARKETING_IDEMPOTENCY_CONFLICT'});
    expect((await listMarketingCampaigns(db))[0]?.title).toBe(base.title);
    await expect(writeMarketingCampaign(db,input,first.id,now,key)).rejects.toMatchObject({status:400});
  } finally { db.close(); }
});

it('dos altas concurrentes con la misma identidad crean sólo una campaña', async () => {
  const db = setup();
  try {
    const key = crypto.randomUUID();
    const [first,second] = await Promise.all([writeMarketingCampaign(db,base,undefined,now,key),writeMarketingCampaign(db,base,undefined,now,key)]);
    expect(second.id).toBe(first.id);
    expect(await listMarketingCampaigns(db)).toHaveLength(1);
  } finally { db.close(); }
});

it('reserva cupos una vez por borrador, es idempotente y preserva evidencia inmutable', async () => {
  const db = setup();
  try {
    const campaign = await writeMarketingCampaign(db,{...base,maxRedemptions:1},undefined,now);
    const quote = await readMarketingQuote(db,lines,null,now);
    const reserve = (orderId:string) => db.batch([db.prepare('INSERT INTO orders VALUES (?)').bind(orderId),
      ...reserveMarketingRedemptionStatements(db,orderId,quote,date)]);
    await reserve('one');
    await db.batch(reserveMarketingRedemptionStatements(db,'one',quote,'2026-10-23T00:00:00.000Z'));
    expect((await listMarketingCampaigns(db))[0]).toMatchObject({id:campaign.id,redemptionCount:1});
    await expect(reserve('two')).rejects.toThrow('MARKETING_CAMPAIGN_UNAVAILABLE');
    expect(await db.prepare("SELECT id FROM orders WHERE id='two'").first()).toBeNull();
    expect(await readMarketingQuote(db,lines,null,now)).toMatchObject({discountMinor:0});
    await expect(db.prepare("UPDATE marketing_redemptions SET created_at='changed'").run()).rejects.toThrow('MARKETING_REDEMPTION_IMMUTABLE');
    await expect(db.prepare('DELETE FROM marketing_redemptions').run()).rejects.toThrow('MARKETING_REDEMPTION_IMMUTABLE');
    expect(await db.prepare('SELECT quote_json FROM marketing_redemptions').first()).toEqual({quote_json:JSON.stringify(quote)});
  } finally { db.close(); }
});

it('reválida vigencia y cambios concurrentes en el batch y exige FK del pedido', async () => {
  const db = setup();
  try {
    const campaign = await writeMarketingCampaign(db,{...base,endsAt:'2026-10-23T00:00:00.000Z'},undefined,now);
    const quote = await readMarketingQuote(db,lines,null,now);
    await expect(db.batch(reserveMarketingRedemptionStatements(db,'missing',quote,date))).rejects.toThrow('FOREIGN KEY');
    await db.prepare("INSERT INTO orders VALUES ('one')").run();
    await expect(db.batch(reserveMarketingRedemptionStatements(db,'one',quote,'2026-10-23T00:00:00.000Z')))
      .rejects.toThrow('MARKETING_CAMPAIGN_UNAVAILABLE');
    await writeMarketingCampaign(db,{...base,percentOff:20},campaign.id,now);
    await expect(db.batch(reserveMarketingRedemptionStatements(db,'one',quote,date))).rejects.toThrow('MARKETING_CAMPAIGN_UNAVAILABLE');
    expect(await db.prepare('SELECT count(*) AS count FROM marketing_redemptions').first()).toEqual({count:0});
  } finally { db.close(); }
});

it('no permite reutilizar un pedido con otra cotización o campaña', async () => {
  const db = setup();
  try {
    const campaign = await writeMarketingCampaign(db,base,undefined,now);
    const quote = await readMarketingQuote(db,lines,null,now);
    await db.batch([db.prepare("INSERT INTO orders VALUES ('one')"),...reserveMarketingRedemptionStatements(db,'one',quote,date)]);
    await writeMarketingCampaign(db,{...base,percentOff:20},campaign.id,now);
    const changed = await readMarketingQuote(db,lines,null,now);
    await expect(db.batch(reserveMarketingRedemptionStatements(db,'one',changed,date))).rejects.toThrow('MARKETING_REDEMPTION_CONFLICT');
    expect(await db.prepare('SELECT quote_json FROM marketing_redemptions').first()).toEqual({quote_json:JSON.stringify(quote)});
  } finally { db.close(); }
});

it('la base rechaza porcentajes y topes fraccionarios aun fuera del endpoint', async () => {
  const db = setup();
  try {
    const campaign = await writeMarketingCampaign(db,base,undefined,now);
    await expect(db.prepare('UPDATE marketing_campaigns SET percent_off=12.5 WHERE id=?').bind(campaign.id).run()).rejects.toThrow();
    await expect(db.prepare('UPDATE marketing_campaigns SET max_discount_minor=1.5 WHERE id=?').bind(campaign.id).run()).rejects.toThrow();
  } finally { db.close(); }
});

it('sin migración mantiene precios base sólo sin cupón y no oculta otros fallos SQL', async () => {
  const db = new SqliteD1('');
  try {
    expect(await readMarketingQuote(db,lines,null,now)).toMatchObject({discountMinor:0});
    expect(await readPublicMarketing(db,now)).toEqual({announcements:[],promotions:[]});
    await expect(readMarketingQuote(db,lines,'PRUEBA',now)).rejects.toMatchObject({code:'MARKETING_UNAVAILABLE'});
    await db.exec('CREATE TABLE marketing_campaigns(id TEXT); CREATE TABLE marketing_redemptions(campaign_id TEXT);');
    await expect(readMarketingQuote(db,lines,null,now)).rejects.toThrow('no such column');
    await expect(readPublicMarketing(db,now)).rejects.toThrow('no such column');
  } finally { db.close(); }
});
