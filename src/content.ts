export const site = {
  name: 'Shekinah',
  tagline: 'Herbolario & tienda gourmet',
  description:
    'Especias, hierbas, semillas y recetas para transformar la cocina cotidiana con sabores de origen.',
  locale: 'es-AR',
  origin: 'https://shekinah-7dl.pages.dev',
  email: 'german.gauna@yahoo.com.ar',
  legalName: 'Germán Ignacio Gauna',
  legalIdentifier: '20-25957366-2',
  address: 'Moreno 2575, Mar del Plata Norte (7600), Buenos Aires, Argentina',
} as const;

export const navigation = [
  { href: '/', label: 'Inicio' },
  { href: '/nosotros/', label: 'Nosotros' },
  { href: '/tienda/', label: 'Tienda' },
  { href: '/recetas/', label: 'Recetas' },
  { href: '/blog/', label: 'Blog' },
] as const;

export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'quote'; text: string };

export interface ContentEntry {
  path: string;
  kind: 'page' | 'post' | 'recipe';
  title: string;
  description: string;
  eyebrow: string;
  image: string;
  imageAlt: string;
  publishedAt?: string;
  categories?: string[];
  ingredients?: string[];
  instructions?: string[];
  blocks: Block[];
}

export const entries: ContentEntry[] = [
  {
    path: '/nosotros/',
    kind: 'page',
    title: 'Nosotros',
    description:
      'La historia y la promesa de Shekinah: origen puro, comercio responsable y respeto por la tierra.',
    eyebrow: 'Nuestra esencia',
    image: '/images/about-spice-shop.webp',
    imageAlt: 'Interior de un herbolario con frascos de especias y productos botánicos.',
    blocks: [
      { type: 'heading', text: 'Nuestra promesa: amor por el origen' },
      {
        type: 'paragraph',
        text: 'En Shekinah no solo seleccionamos especias: rescatamos historias milenarias. Nuestra herboristería nace de una pasión por el bienestar y la alta cocina, acercando tesoros botánicos cultivados con respeto por la tierra.',
      },
      {
        type: 'paragraph',
        text: 'Cada hebra, semilla y hoja que llega a tu alacena busca preservar pureza, sabor auténtico y una relación responsable con su origen. La intención es simple: transformar platos cotidianos en experiencias extraordinarias.',
      },
      { type: 'heading', text: 'El arte de la alquimia natural' },
      {
        type: 'paragraph',
        text: 'La confianza es nuestro ingrediente principal. Cada producto se selecciona con atención para acercar sabores reales, orígenes éticos y materias primas que permitan experimentar con la riqueza de la gastronomía global.',
      },
      { type: 'quote', text: 'Cada especia trae un pedazo de historia en sabores y bienestar.' },
      {
        type: 'paragraph',
        text: 'La evidencia recuperada también muestra una presencia física vinculada a Shekinah y una actividad comercial informada a través de Mercado Libre. Este sitio no publica un enlace de tienda externa porque ese destino no pudo verificarse con seguridad.',
      },
    ],
  },
  {
    path: '/tienda/',
    kind: 'page',
    title: 'Tienda',
    description:
      'Catálogo informativo de especias, hierbas, semillas, cacao y productos gourmet de Shekinah.',
    eyebrow: 'Catálogo informativo',
    image: '/images/about-spice-shop.webp',
    imageAlt: 'Selección ordenada de especias, hierbas y semillas.',
    blocks: [
      {
        type: 'paragraph',
        text: 'La página de tienda recuperada no contenía productos, precios ni una integración de comercio electrónico. Para evitar inventar stock o condiciones comerciales, esta versión presenta únicamente las familias de productos corroboradas en el contenido.',
      },
      { type: 'heading', text: 'Especias y hierbas' },
      {
        type: 'paragraph',
        text: 'Selecciones para cocina, infusiones y preparaciones aromáticas. El contenido recuperado menciona romero, canela de Ceylán, cúrcuma, jengibre, hinojo, comino y clavo de olor.',
      },
      { type: 'heading', text: 'Semillas y cacao' },
      {
        type: 'paragraph',
        text: 'El recetario hace referencia a semillas de cacao naturales, manteca de cacao y semillas para preparaciones caseras.',
      },
      { type: 'heading', text: 'Frutos secos y complementos' },
      {
        type: 'paragraph',
        text: 'Las recetas mencionan pistachos, avena, miel y otros ingredientes secos utilizados en chocolates y barras de cereal.',
      },
      { type: 'heading', text: 'Consulta de disponibilidad' },
      {
        type: 'paragraph',
        text: 'La disponibilidad, el precio y la modalidad de entrega deben confirmarse por correo electrónico. Este sitio no posee carrito, checkout, cuentas ni almacenamiento de pedidos.',
      },
    ],
  },
  {
    path: '/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/',
    kind: 'post',
    title: 'El poder del romero: memoria milenaria y frescura en tu cocina',
    description:
      'Historia, perfil aromático y formas simples de incorporar romero a la cocina cotidiana.',
    eyebrow: 'Hierbas',
    image: '/images/about-spice-shop.webp',
    imageAlt: 'Ramas frescas de romero junto a una selección de especias.',
    publishedAt: '2026-04-25',
    categories: ['Hierbas'],
    blocks: [
      {
        type: 'paragraph',
        text: 'El romero ha sido valorado desde la antigüedad. En las tradiciones griega y romana se lo vinculaba con la memoria y la claridad. Hoy sigue siendo una de las hierbas más versátiles de la cocina.',
      },
      { type: 'heading', text: 'En la cocina' },
      {
        type: 'paragraph',
        text: 'Su perfil aromático combina notas a pino, madera y un matiz cítrico. Unas ramas pueden elevar un asado, aportar carácter a papas rústicas o perfumar aceite de oliva.',
      },
      { type: 'heading', text: 'Tradición y bienestar' },
      {
        type: 'paragraph',
        text: 'El romero contiene compuestos aromáticos y antioxidantes estudiados por la ciencia, pero el uso gastronómico no debe confundirse con un tratamiento médico. Tradicionalmente se lo incorporó a infusiones y preparaciones vinculadas con la digestión y el confort.',
      },
      { type: 'heading', text: 'Cómo integrarlo' },
      {
        type: 'paragraph',
        text: 'No lo limites a los platos principales. Podés usar una pequeña cantidad en panes, vegetales al horno, aceites saborizados o bebidas sin alcohol. Su intensidad exige moderación: es mejor agregar poco y ajustar.',
      },
    ],
  },
  {
    path: '/el-viaje-de-las-especias-sabor-y-bienestar/',
    kind: 'post',
    title: 'El viaje de las especias: sabor y bienestar',
    description:
      'De las rutas comerciales a la cocina cotidiana: historia, aroma y usos tradicionales de las especias.',
    eyebrow: 'Especias',
    image: '/images/about-spice-shop.webp',
    imageAlt: 'Frascos con una selección de especias de distintos colores.',
    publishedAt: '2026-05-07',
    categories: ['Especias'],
    blocks: [
      {
        type: 'paragraph',
        text: 'Sabor natural. Historia viva. Desde las antiguas rutas comerciales que conectaban continentes hasta la alacena de tu cocina, las especias han sido uno de los tesoros más valorados de la humanidad. Transformaron la forma de comerciar, cocinar y conservar alimentos.',
      },
      { type: 'heading', text: 'La alquimia en tu cocina' },
      {
        type: 'paragraph',
        text: 'Una pizca de la especia correcta puede convertir lo cotidiano en extraordinario. No se trata solo de sazonar, sino de construir una experiencia sensorial: el calor del pimentón, la frescura del cardamomo o la profundidad de la nuez moscada aportan identidad a cada plato.',
      },
      { type: 'heading', text: 'El botiquín tradicional de la naturaleza' },
      {
        type: 'list',
        items: [
          'Clavo de olor y canela: valorados por sus compuestos antioxidantes.',
          'Cúrcuma y jengibre: usados tradicionalmente en preparaciones asociadas al confort general.',
          'Hinojo y comino: frecuentes en infusiones y recetas digestivas.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Estas referencias son culturales y gastronómicas; no reemplazan asesoramiento médico ni tratamientos profesionales.',
      },
      { type: 'heading', text: 'Tu propia ruta de las especias' },
      {
        type: 'paragraph',
        text: 'Evitá cocinar en piloto automático. Olé, probá y experimentá. Integrá pequeños tesoros botánicos en infusiones, guisos, postres y rituales cotidianos.',
      },
    ],
  },
  {
    path: '/receta-barra-de-cereal/',
    kind: 'recipe',
    title: 'Barras caseras de cereal',
    description: 'Base recuperada para preparar barras con avena, frutos secos, miel y semillas.',
    eyebrow: 'Receta recuperada',
    image: '/images/culinary-kitchen.webp',
    imageAlt: 'Frascos de productos secos sobre una mesada luminosa.',
    publishedAt: '2026-07-20',
    categories: ['Barras'],
    ingredients: ['Avena', 'Frutos secos', 'Miel', 'Semillas naturales'],
    instructions: [],
    blocks: [
      {
        type: 'paragraph',
        text: 'La fuente recuperada presenta estas barras como una opción simple de snack con avena, frutos secos, miel y semillas. No contenía cantidades ni un procedimiento completo, por lo que esta versión conserva únicamente la información comprobada y evita inventar una receta que podría fallar.',
      },
      { type: 'heading', text: 'Adaptaciones' },
      {
        type: 'paragraph',
        text: 'El contenido original indica que la preparación puede adaptarse a una versión vegana. Para hacerlo, la miel debe sustituirse por un aglutinante vegetal adecuado; la proporción y el método no estaban especificados en la evidencia.',
      },
      { type: 'heading', text: 'Conservación' },
      {
        type: 'paragraph',
        text: 'La fuente indica una duración orientativa de hasta dos semanas en un recipiente hermético y en un lugar fresco, con recomendación de refrigeración para mantener la frescura.',
      },
      { type: 'heading', text: 'Información pendiente' },
      {
        type: 'paragraph',
        text: 'Faltan cantidades, temperatura, tiempo de cocción y un paso a paso validado. Antes de publicar una fórmula definitiva, esos datos deben ser confirmados por la persona responsable de Shekinah.',
      },
    ],
  },
  {
    path: '/chocolate-casero/',
    kind: 'recipe',
    title: 'Chocolate casero',
    description:
      'Una guía artesanal para transformar semillas de cacao en una tableta rústica, intensa y aromática.',
    eyebrow: 'Receta artesanal',
    image: '/images/culinary-kitchen.webp',
    imageAlt: 'Cocina de preparación artesanal con mesadas y utensilios.',
    publishedAt: '2026-07-20',
    categories: ['Chocolate'],
    ingredients: [
      '250 g de semillas de cacao naturales',
      '50 a 80 g de manteca de cacao',
      '80 a 100 g de azúcar impalpable o eritritol en polvo',
      'Una pizca de sal marina fina',
      'Canela de Ceylán, opcional',
      'Pistachos, opcionales',
    ],
    instructions: [
      'Tostar las semillas a temperatura baja durante 15 a 20 minutos.',
      'Enfriar, retirar las cáscaras y conservar los nibs de cacao.',
      'Procesar los nibs en tandas hasta obtener una pasta espesa.',
      'Incorporar la manteca de cacao derretida, el endulzante seco y la sal.',
      'Procesar nuevamente, volcar en un molde y agregar los complementos secos.',
      'Refrigerar hasta que la tableta esté firme.',
    ],
    blocks: [
      {
        type: 'paragraph',
        text: 'Hacer chocolate en casa es una forma de alquimia culinaria: una semilla dura se transforma en una tableta intensa. Sin maquinaria industrial, el resultado tendrá una textura algo más rústica; esa diferencia es parte del carácter artesanal.',
      },
      { type: 'heading', text: 'Ingredientes y reglas clave' },
      {
        type: 'paragraph',
        text: 'La materia prima define el resultado. Usá ingredientes secos y recipientes completamente limpios. No agregues agua, miel, jarabes ni endulzantes líquidos: la humedad puede hacer que la mezcla se corte y forme una pasta difícil de moldear.',
      },
      { type: 'heading', text: 'Paso 1: tostado' },
      {
        type: 'paragraph',
        text: 'Calentá el horno a unos 120 °C. Distribuí las semillas en una fuente y tostalas entre 15 y 20 minutos. Dejalas enfriar antes de manipularlas.',
      },
      { type: 'heading', text: 'Paso 2: pelado' },
      {
        type: 'paragraph',
        text: 'Frotá las semillas tostadas para retirar la cáscara. Conservá el interior oscuro y crujiente: esos fragmentos son los nibs de cacao.',
      },
      { type: 'heading', text: 'Paso 3: procesado' },
      {
        type: 'paragraph',
        text: 'Procesá los nibs en tandas. Detené la máquina cada pocos minutos para evitar sobrecalentar el motor y raspá los bordes con una espátula seca. Con paciencia, la grasa natural del cacao hará que el polvo se transforme en una pasta espesa y brillante.',
      },
      { type: 'heading', text: 'Paso 4: mezcla' },
      {
        type: 'paragraph',
        text: 'Incorporá la manteca de cacao derretida, el endulzante seco, la sal y, si elegiste usarla, la canela. Cuanto más fino sea el procesado, menos granulosa será la textura.',
      },
      { type: 'heading', text: 'Paso 5: moldeado y enfriado' },
      {
        type: 'paragraph',
        text: 'Volcá la mezcla en un molde seco, liberá las burbujas, agregá los complementos secos y llevá a la heladera hasta que quede firme. Como esta guía evita el templado profesional, conviene conservar el chocolate refrigerado.',
      },
      { type: 'heading', text: 'Preguntas frecuentes' },
      {
        type: 'list',
        items: [
          'Una textura algo arenosa es normal sin una conchadora industrial; puede mejorar con más procesado y pausas.',
          'La manteca de cacao ayuda a lograr una mezcla fluida y una sensación más sedosa.',
          'Los frutos secos se agregan después de verter el chocolate en el molde y antes de refrigerar.',
        ],
      },
    ],
  },
  {
    path: '/terms-and-conditions/',
    kind: 'page',
    title: 'Términos y condiciones',
    description: 'Condiciones de uso, consultas, envíos, cancelaciones, devoluciones y reembolsos de Shekinah.',
    eyebrow: 'Información legal',
    image: '/images/about-spice-shop.webp',
    imageAlt: 'Productos botánicos y especias en un espacio de atención.',
    blocks: [
      { type: 'heading', text: 'Responsable del sitio' },
      {
        type: 'list',
        items: [
          'Responsable: Germán Ignacio Gauna.',
          'CUIT: 20-25957366-2.',
          'Domicilio comercial: Moreno 2575, Mar del Plata Norte (7600), Buenos Aires, Argentina.',
          'Contacto: german.gauna@yahoo.com.ar.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Estas condiciones regulan el uso del sitio y las consultas o compras que se coordinen a partir de él.',
      },
      { type: 'heading', text: '1. Información de productos y disponibilidad' },
      {
        type: 'paragraph',
        text: 'Se procura mostrar con precisión las imágenes y descripciones. La disponibilidad debe confirmarse antes de concretar una operación. Si un producto no está disponible, se informarán las alternativas posibles.',
      },
      { type: 'heading', text: '2. Precios y pagos' },
      {
        type: 'paragraph',
        text: 'Los precios, medios de pago y condiciones comerciales deben confirmarse al momento de la consulta. El sitio estático actual no procesa pagos, pedidos ni datos de tarjetas.',
      },
      { type: 'heading', text: '3. Envíos y tiempos de entrega' },
      {
        type: 'paragraph',
        text: 'La evidencia recuperada indica que se realizan envíos dentro de Argentina. Los plazos informados son estimativos y pueden depender del transportista, la distancia y causas de fuerza mayor.',
      },
      { type: 'heading', text: '4. Cancelación de pedidos' },
      {
        type: 'paragraph',
        text: 'Puede solicitarse la cancelación antes del despacho. Una vez entregado el paquete al transportista, la gestión se considera una devolución.',
      },
      { type: 'heading', text: '5. Condiciones para devoluciones' },
      {
        type: 'paragraph',
        text: 'El contenido recuperado establece un plazo de 10 días corridos desde la recepción para solicitar una devolución.',
      },
      {
        type: 'list',
        items: [
          'El producto debe conservar su embalaje original, sellado y sin señales de manipulación.',
          'Debe presentarse el comprobante de compra o número de pedido.',
          'Por razones sanitarias, no se aceptan hierbas o productos de consumo abiertos.',
        ],
      },
      { type: 'heading', text: '6. Productos dañados o enviados por error' },
      {
        type: 'paragraph',
        text: 'La situación debe comunicarse dentro de las primeras 48 horas posteriores a la recepción, indicando el número de pedido y adjuntando fotografías claras del paquete y del producto.',
      },
      { type: 'heading', text: '7. Proceso de devolución' },
      {
        type: 'paragraph',
        text: 'La solicitud se inicia por el canal de contacto público. Salvo error del vendedor o daño durante el transporte, el costo del envío de devolución corresponde al comprador.',
      },
      { type: 'heading', text: '8. Reembolsos' },
      {
        type: 'paragraph',
        text: 'Una vez recibido e inspeccionado el producto, se comunicará la aprobación o rechazo. Los tiempos de acreditación dependen del medio de pago y de la entidad financiera.',
      },
      { type: 'heading', text: '9. Productos no retornables' },
      {
        type: 'list',
        items: [
          'Productos abiertos, usados o con precintos alterados.',
          'Tarjetas de regalo.',
          'Artículos en liquidación o sujetos a condiciones especiales, salvo obligación legal en contrario.',
        ],
      },
      { type: 'heading', text: '10. Propiedad intelectual' },
      {
        type: 'paragraph',
        text: 'Los textos, imágenes, logotipos y demás materiales identificados como propios de Shekinah no pueden reproducirse o reutilizarse sin autorización, excepto cuando la ley lo permita.',
      },
      { type: 'heading', text: '11. Alcance del sitio actual' },
      {
        type: 'paragraph',
        text: 'Esta aplicación es un catálogo y sitio de contenidos estático. No crea cuentas, no almacena datos de usuarios, no utiliza comentarios, no procesa pagos y no instala cookies de seguimiento.',
      },
    ],
  },
];

export const posts = entries.filter((entry) => entry.kind === 'post');
export const recipes = entries.filter((entry) => entry.kind === 'recipe');
export const canonicalRoutes = [
  '/',
  '/nosotros/',
  '/tienda/',
  '/blog/',
  '/recetas/',
  ...posts.map((entry) => entry.path),
  ...recipes.map((entry) => entry.path),
  '/terms-and-conditions/',
  '/category/uncategorized/',
] as const;

export const redirects = [
  { from: '/inicio/', to: '/', status: 301 },
  { from: '/terminos-condiciones/', to: '/terms-and-conditions/', status: 301 },
] as const;

export function normalizePath(value: string): string {
  const path = value.split(/[?#]/u)[0] || '/';
  if (path === '/') return '/';
  return `/${path.replace(/^\/+|\/+$/gu, '')}/`;
}

export function findEntry(path: string): ContentEntry | undefined {
  const normalized = normalizePath(path);
  return entries.find((entry) => entry.path === normalized);
}
