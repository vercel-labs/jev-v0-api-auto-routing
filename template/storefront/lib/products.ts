export type Product = {
  handle: string;
  title: string;
  price: string;
  compareAtPrice?: string;
  currencyCode: string;
  image: string;
  imageAlt: string;
  description: string;
  availableForSale: boolean;
};

export const products: Product[] = [
  {
    handle: "canvas-tote",
    title: "Heavy Canvas Tote",
    price: "38.00",
    compareAtPrice: "46.00",
    currencyCode: "USD",
    image: "https://picsum.photos/seed/shop-tote/900/900",
    imageAlt: "Heavy canvas tote bag",
    description:
      "A 16 oz washed-canvas tote with an interior zip pocket and reinforced straps. Carries groceries, laptops, and everything between.",
    availableForSale: true,
  },
  {
    handle: "ceramic-mug",
    title: "Studio Ceramic Mug",
    price: "24.00",
    currencyCode: "USD",
    image: "https://picsum.photos/seed/shop-mug/900/900",
    imageAlt: "Hand-thrown ceramic mug",
    description:
      "Hand-thrown stoneware with a satin glaze. 12 oz, dishwasher and microwave safe. Small batch, so every piece varies slightly.",
    availableForSale: true,
  },
  {
    handle: "wool-throw",
    title: "Merino Wool Throw",
    price: "96.00",
    compareAtPrice: "120.00",
    currencyCode: "USD",
    image: "https://picsum.photos/seed/shop-throw/900/900",
    imageAlt: "Merino wool throw blanket",
    description:
      "A generously sized merino throw with hand-knotted fringe. Warm without weight, and it softens with every wash.",
    availableForSale: true,
  },
  {
    handle: "pour-over-kit",
    title: "Pour-Over Starter Kit",
    price: "64.00",
    currencyCode: "USD",
    image: "https://picsum.photos/seed/shop-coffee/900/900",
    imageAlt: "Pour-over coffee starter kit",
    description:
      "Glass dripper, steel filter, and a 600 ml carafe. Everything you need for a slow morning except the beans.",
    availableForSale: true,
  },
  {
    handle: "linen-apron",
    title: "Everyday Linen Apron",
    price: "52.00",
    currencyCode: "USD",
    image: "https://picsum.photos/seed/shop-apron/900/900",
    imageAlt: "Linen apron",
    description:
      "Stonewashed linen with cross-back straps and two deep pockets. Pre-shrunk and machine washable.",
    availableForSale: true,
  },
  {
    handle: "brass-pen",
    title: "Machined Brass Pen",
    price: "42.00",
    currencyCode: "USD",
    image: "https://picsum.photos/seed/shop-pen/900/900",
    imageAlt: "Machined brass pen",
    description:
      "Solid brass, machined from a single bar. Takes standard refills and develops a patina that is yours alone.",
    availableForSale: false,
  },
  {
    handle: "trail-socks",
    title: "Trail Socks, Set of 3",
    price: "28.00",
    currencyCode: "USD",
    image: "https://picsum.photos/seed/shop-socks/900/900",
    imageAlt: "Wool trail socks",
    description:
      "Merino-blend hiking socks with a reinforced heel. Three pairs, three colors, zero blisters.",
    availableForSale: true,
  },
  {
    handle: "wooden-board",
    title: "Walnut Serving Board",
    price: "58.00",
    compareAtPrice: "72.00",
    currencyCode: "USD",
    image: "https://picsum.photos/seed/shop-board/900/900",
    imageAlt: "Walnut serving board",
    description:
      "End-grain walnut, food-safe oil finish, with a leather hanging loop. Pretty enough to leave on the counter.",
    availableForSale: true,
  },
];

export function getProduct(handle: string): Product | undefined {
  return products.find((p) => p.handle === handle);
}
