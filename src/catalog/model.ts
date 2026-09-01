export type ProductPrice = Readonly<{
  amount: number;
  currency: 'ARS';
}>;

export type ProductImage = Readonly<{
  src: string;
  alt: string;
}>;

const legacyCatalogImagePattern =
  /^\/images\/original\/catalog\/[a-f0-9]{64}\.(?:jpg|png|webp)$/u;
const managedCatalogImagePattern =
  /^\/api\/catalog-images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u;

export type CatalogVariantOption = Readonly<{
  name: string;
  value: string;
}>;

export type CatalogVariant = Readonly<{
  title?: string;
  price: ProductPrice;
  salePrice?: ProductPrice;
  sku?: string;
  available: boolean;
  options: readonly CatalogVariantOption[];
}>;

export type CatalogCategory = Readonly<{
  slug: string;
  path: string;
  name: string;
  productCount: number;
}>;

export type CommerceAvailabilityState =
  | 'verified'
  | 'out_of_stock'
  | 'updating'
  | 'unavailable';

export type MercadoLibreCommerceSnapshot = Readonly<{
  source: 'mercadolibre';
  catalogVersion: string;
  syncedAt: string;
  availabilityState: CommerceAvailabilityState;
  checkoutEligible: boolean;
}>;

export type DuxCommerceSnapshot = Readonly<{
  source: 'dux';
  catalogVersion: string;
  syncedAt: string;
  availabilityState: CommerceAvailabilityState;
  checkoutEligible: boolean;
  mappingStatus: 'mapped' | 'unmapped' | 'ambiguous';
  quantitySemanticsStatus: 'unavailable_from_v2_items' | 'verified' | 'unsupported';
  observedStock?: Readonly<{
    real: number;
    reserved: number;
    available: number;
  }>;
  unit?: Readonly<{
    id?: string;
    name?: string;
    symbol?: string;
  }>;
  depositName?: string;
}>;

export type ProductCommerceSnapshot =
  | MercadoLibreCommerceSnapshot
  | DuxCommerceSnapshot;

export type CatalogProductSummary = Readonly<{
  id: string;
  slug: string;
  path: string;
  name: string;
  categorySlugs: readonly string[];
  categoryNames: readonly string[];
  presentation?: string;
  price: ProductPrice;
  salePrice?: ProductPrice;
  sku?: string;
  availability?: 'available' | 'unavailable';
  shortDescription?: string;
  primaryImage?: ProductImage;
  commerce?: ProductCommerceSnapshot;
}>;

export type Product = CatalogProductSummary;

export type CatalogProductDetail = CatalogProductSummary &
  Readonly<{
    description?: string;
    images: readonly ProductImage[];
    variants: readonly CatalogVariant[];
  }>;

export class InvalidProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProductError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredText(source: Record<string, unknown>, field: string): string {
  const value = source[field];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidProductError(`El campo "${field}" debe ser un texto no vacío.`);
  }

  return value.trim();
}

function readOptionalText(source: Record<string, unknown>, field: string): string | undefined {
  if (!Object.hasOwn(source, field) || source[field] === undefined) {
    return undefined;
  }

  return readRequiredText(source, field);
}

function parsePrice(value: unknown, field = 'price'): ProductPrice {
  if (!isRecord(value)) {
    throw new InvalidProductError(`El campo "${field}" debe ser un precio válido.`);
  }

  if (
    typeof value.amount !== 'number' ||
    !Number.isFinite(value.amount) ||
    value.amount <= 0
  ) {
    throw new InvalidProductError('El importe debe ser un número finito y positivo.');
  }

  if (value.currency !== 'ARS') {
    throw new InvalidProductError('La moneda admitida para el catálogo es ARS.');
  }

  const amountInMinorUnits = value.amount * 100;
  if (
    !Number.isSafeInteger(Math.round(amountInMinorUnits)) ||
    Math.abs(amountInMinorUnits - Math.round(amountInMinorUnits)) > 0.000001
  ) {
    throw new InvalidProductError('El importe debe usar como máximo dos decimales.');
  }

  return Object.freeze({ amount: value.amount, currency: value.currency });
}

function parseImage(value: unknown): ProductImage {
  if (!isRecord(value)) {
    throw new InvalidProductError('La imagen debe ser un objeto válido.');
  }

  const src = readRequiredText(value, 'src');
  if (!legacyCatalogImagePattern.test(src) && !isManagedCatalogImagePath(src)) {
    throw new InvalidProductError(`La imagen debe usar una ruta local autorizada: ${src}.`);
  }

  return Object.freeze({ src, alt: readRequiredText(value, 'alt') });
}

export function isManagedCatalogImagePath(value: string): boolean {
  return managedCatalogImagePattern.test(value);
}

export function isProductEffectivelyAvailable(
  product: Pick<
    CatalogProductSummary,
    'availability' | 'commerce'
  >,
): boolean {
  const commerce = product.commerce;
  return (
    product.availability !== 'unavailable' &&
    commerce?.source === 'dux' &&
    commerce.mappingStatus === 'mapped' &&
    commerce.quantitySemanticsStatus === 'verified' &&
    commerce.availabilityState === 'verified' &&
    commerce.checkoutEligible &&
    commerce.observedStock !== undefined &&
    commerce.observedStock.available > 0
  );
}

function parseTextArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new InvalidProductError(`El campo "${field}" debe ser una colección.`);
  }

  const result = value.map((item) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new InvalidProductError(`El campo "${field}" contiene un texto inválido.`);
    }
    return item.trim();
  });

  if (new Set(result).size !== result.length) {
    throw new InvalidProductError(`El campo "${field}" contiene duplicados.`);
  }

  return Object.freeze(result);
}

export function parseCategory(value: unknown): CatalogCategory {
  if (!isRecord(value)) {
    throw new InvalidProductError('La categoría debe ser un objeto válido.');
  }

  const slug = readRequiredText(value, 'slug');
  const categoryPath = readRequiredText(value, 'path');
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(slug) || categoryPath !== `/tienda/categoria/${slug}/`) {
    throw new InvalidProductError(`La categoría "${slug}" no tiene un slug o path seguro.`);
  }
  if (!Number.isInteger(value.productCount) || Number(value.productCount) < 0) {
    throw new InvalidProductError(`La categoría "${slug}" no tiene un conteo válido.`);
  }

  return Object.freeze({
    slug,
    path: categoryPath,
    name: readRequiredText(value, 'name'),
    productCount: Number(value.productCount),
  });
}

export function parseCategories(values: readonly unknown[]): readonly CatalogCategory[] {
  const slugs = new Set<string>();
  const paths = new Set<string>();
  const categories = values.map((value) => {
    const category = parseCategory(value);
    if (slugs.has(category.slug) || paths.has(category.path)) {
      throw new InvalidProductError(`La categoría "${category.slug}" está duplicada.`);
    }
    slugs.add(category.slug);
    paths.add(category.path);
    return category;
  });

  return Object.freeze(categories);
}

export function parseProduct(value: unknown): Product {
  if (!isRecord(value)) {
    throw new InvalidProductError('El producto debe ser un objeto válido.');
  }

  const id = readRequiredText(value, 'id');
  const slug = readRequiredText(value, 'slug');
  const productPath = readRequiredText(value, 'path');
  if (
    id !== slug ||
    !/^[a-z0-9][a-z0-9-]*$/u.test(slug) ||
    productPath !== `/${slug}/`
  ) {
    throw new InvalidProductError(`El producto "${slug}" no tiene un ID, slug o path seguro.`);
  }

  const categorySlugs = parseTextArray(value.categorySlugs, 'categorySlugs');
  const categoryNames = parseTextArray(value.categoryNames, 'categoryNames');
  if (categorySlugs.length !== categoryNames.length) {
    throw new InvalidProductError(`Las categorías de "${slug}" no coinciden.`);
  }

  const salePrice = Object.hasOwn(value, 'salePrice')
    ? parsePrice(value.salePrice, 'salePrice')
    : undefined;
  const primaryImage = Object.hasOwn(value, 'primaryImage')
    ? parseImage(value.primaryImage)
    : undefined;
  const presentation = readOptionalText(value, 'presentation');
  const sku = readOptionalText(value, 'sku');
  const availability = readOptionalText(value, 'availability');
  if (
    availability !== undefined &&
    availability !== 'available' &&
    availability !== 'unavailable'
  ) {
    throw new InvalidProductError('La disponibilidad del producto no es válida.');
  }
  if (
    Object.hasOwn(value, 'stockQuantity') ||
    Object.hasOwn(value, 'reservedQuantity') ||
    Object.hasOwn(value, 'availableQuantity')
  ) {
    throw new InvalidProductError(
      'El catálogo no admite stock local; el inventario pertenece exclusivamente a Dux.',
    );
  }
  const shortDescription = readOptionalText(value, 'shortDescription');
  const commerce = Object.hasOwn(value, 'commerce')
    ? parseCommerceSnapshot(value.commerce)
    : undefined;
  return Object.freeze({
    id,
    slug,
    path: productPath,
    name: readRequiredText(value, 'name'),
    categorySlugs,
    categoryNames,
    ...(presentation === undefined ? {} : { presentation }),
    price: parsePrice(value.price),
    ...(salePrice === undefined ? {} : { salePrice }),
    ...(sku === undefined ? {} : { sku }),
    ...(availability === undefined ? {} : { availability }),
    ...(shortDescription === undefined ? {} : { shortDescription }),
    ...(primaryImage === undefined ? {} : { primaryImage }),
    ...(commerce === undefined ? {} : { commerce }),
  });
}

function parseCommerceSnapshot(value: unknown): NonNullable<Product['commerce']> {
  if (!isRecord(value) || (value.source !== 'mercadolibre' && value.source !== 'dux')) {
    throw new InvalidProductError('La referencia comercial del producto no es válida.');
  }
  const catalogVersion = readRequiredText(value, 'catalogVersion');
  const syncedAt = readRequiredText(value, 'syncedAt');
  const availabilityState = readRequiredText(value, 'availabilityState');
  if (
    !/^[a-f0-9]{64}$/u.test(catalogVersion) ||
    Number.isNaN(Date.parse(syncedAt)) ||
    !['verified', 'out_of_stock', 'updating', 'unavailable'].includes(availabilityState) ||
    typeof value.checkoutEligible !== 'boolean'
  ) {
    throw new InvalidProductError('La referencia comercial del producto no es válida.');
  }

  const normalizedBase = {
    catalogVersion,
    syncedAt: new Date(syncedAt).toISOString(),
    availabilityState: availabilityState as CommerceAvailabilityState,
    checkoutEligible: value.checkoutEligible,
  };

  if (value.source === 'mercadolibre') {
    return Object.freeze({
      source: 'mercadolibre',
      ...normalizedBase,
    });
  }

  const mappingStatus = readRequiredText(value, 'mappingStatus');
  const quantitySemanticsStatus = readRequiredText(value, 'quantitySemanticsStatus');
  if (
    !['mapped', 'unmapped', 'ambiguous'].includes(mappingStatus) ||
    !['unavailable_from_v2_items', 'verified', 'unsupported'].includes(
      quantitySemanticsStatus,
    )
  ) {
    throw new InvalidProductError('La referencia de inventario Dux no es válida.');
  }

  const observedStock = Object.hasOwn(value, 'observedStock')
    ? parseDuxObservedStock(value.observedStock)
    : undefined;
  const unit = Object.hasOwn(value, 'unit') ? parseDuxUnit(value.unit) : undefined;
  const depositName = readOptionalText(value, 'depositName');

  if (
    value.checkoutEligible &&
    (mappingStatus !== 'mapped' ||
      quantitySemanticsStatus !== 'verified' ||
      availabilityState !== 'verified' ||
      observedStock === undefined ||
      observedStock.available <= 0)
  ) {
    throw new InvalidProductError(
      'Dux no confirmó todos los datos necesarios para habilitar el checkout.',
    );
  }

  return Object.freeze({
    source: 'dux',
    ...normalizedBase,
    mappingStatus: mappingStatus as DuxCommerceSnapshot['mappingStatus'],
    quantitySemanticsStatus:
      quantitySemanticsStatus as DuxCommerceSnapshot['quantitySemanticsStatus'],
    ...(observedStock === undefined ? {} : { observedStock }),
    ...(unit === undefined ? {} : { unit }),
    ...(depositName === undefined ? {} : { depositName }),
  });
}

function parseDuxObservedStock(value: unknown): NonNullable<DuxCommerceSnapshot['observedStock']> {
  if (
    !isRecord(value) ||
    typeof value.real !== 'number' ||
    !Number.isFinite(value.real) ||
    typeof value.reserved !== 'number' ||
    !Number.isFinite(value.reserved) ||
    typeof value.available !== 'number' ||
    !Number.isFinite(value.available)
  ) {
    throw new InvalidProductError('El stock observado en Dux debe contener números finitos.');
  }

  return Object.freeze({
    real: value.real,
    reserved: value.reserved,
    available: value.available,
  });
}

function parseDuxUnit(value: unknown): NonNullable<DuxCommerceSnapshot['unit']> {
  if (!isRecord(value)) {
    throw new InvalidProductError('La unidad de inventario Dux no es válida.');
  }

  const id = readOptionalText(value, 'id');
  const name = readOptionalText(value, 'name');
  const symbol = readOptionalText(value, 'symbol');
  return Object.freeze({
    ...(id === undefined ? {} : { id }),
    ...(name === undefined ? {} : { name }),
    ...(symbol === undefined ? {} : { symbol }),
  });
}

export function parseProducts(
  values: readonly unknown[],
  categories: readonly CatalogCategory[] = [],
): readonly Product[] {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const paths = new Set<string>();
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const products = values.map((value) => {
    const product = parseProduct(value);
    if (ids.has(product.id) || slugs.has(product.slug) || paths.has(product.path)) {
      throw new InvalidProductError(`El producto "${product.slug}" está duplicado.`);
    }
    if (categories.length > 0) {
      product.categorySlugs.forEach((categorySlug, index) => {
        const category = categoryBySlug.get(categorySlug);
        if (category === undefined || category.name !== product.categoryNames[index]) {
          throw new InvalidProductError(
            `La categoría "${categorySlug}" de "${product.slug}" no existe.`,
          );
        }
      });
    }
    ids.add(product.id);
    slugs.add(product.slug);
    paths.add(product.path);
    return product;
  });

  return Object.freeze(products);
}

function parseVariant(value: unknown): CatalogVariant {
  if (!isRecord(value) || typeof value.available !== 'boolean' || !Array.isArray(value.options)) {
    throw new InvalidProductError('La variante debe ser un objeto válido.');
  }

  const options = Object.freeze(
    value.options.map((option) => {
      if (!isRecord(option)) {
        throw new InvalidProductError('La opción de variante debe ser un objeto válido.');
      }
      return Object.freeze({
        name: readRequiredText(option, 'name'),
        value: readRequiredText(option, 'value'),
      });
    }),
  );
  const salePrice = Object.hasOwn(value, 'salePrice')
    ? parsePrice(value.salePrice, 'salePrice')
    : undefined;
  const title = readOptionalText(value, 'title');
  const sku = readOptionalText(value, 'sku');

  return Object.freeze({
    ...(title === undefined ? {} : { title }),
    price: parsePrice(value.price),
    ...(salePrice === undefined ? {} : { salePrice }),
    ...(sku === undefined ? {} : { sku }),
    available: value.available,
    options,
  });
}

export function parseProductDetail(
  summary: Product,
  value: unknown,
): CatalogProductDetail {
  if (!isRecord(value) || !Array.isArray(value.images) || !Array.isArray(value.variants)) {
    throw new InvalidProductError(`El detalle de "${summary.slug}" no es válido.`);
  }

  const images = Object.freeze(value.images.map(parseImage));
  if ((summary.primaryImage?.src ?? null) !== (images[0]?.src ?? null)) {
    throw new InvalidProductError(`La imagen principal de "${summary.slug}" no coincide.`);
  }
  const variants = Object.freeze(value.variants.map(parseVariant));
  const description = readOptionalText(value, 'description');

  return Object.freeze({
    ...summary,
    ...(description === undefined ? {} : { description }),
    images,
    variants,
  });
}
