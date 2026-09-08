/** Explicit test adapter for legacy visual fixtures; never imported by the application. */
export function duxApiFixture(value: Record<string, unknown>): Record<string, unknown> {
  const dux = (raw: unknown) => {
    const product = raw as Record<string, unknown>;
    return { ...product, sku: product.sku ?? `DUX-TEST-${String(product.id)}`, priceStatus: product.priceStatus ?? 'usable',
      commerce: product.commerce ?? { source: 'dux', catalogVersion: 'd'.repeat(64), syncedAt: '2026-09-08T12:00:00.000Z',
        availabilityState: 'unavailable', checkoutEligible: false, mappingStatus: 'unmapped', quantitySemanticsStatus: 'unavailable_from_v2_items' } };
  };
  if (Array.isArray(value.products)) {
    const products = value.products.map(dux);
    const categories = new Map<string,{slug:string;path:string;name:string;productCount:number}>();
    for (const product of products) {
      const raw = product as Record<string, unknown>;
      (raw.categorySlugs as string[]).forEach((slug,index)=>{
        const current=categories.get(slug);
        categories.set(slug,{slug,path:`/tienda/categoria/${slug}/`,name:(raw.categoryNames as string[])[index]!,productCount:(current?.productCount??0)+1});
      });
    }
    return {...value,schemaVersion:2,source:'dux',products,categories:[...categories.values()],manualCatalogRetired:true};
  }
  return {...value,schemaVersion:2,product:dux(value.product)};
}
