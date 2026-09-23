import { notFound } from "next/navigation";
import { getProduct, products } from "@/lib/products";

export function generateStaticParams() {
  return products.map((product) => ({ handle: product.handle }));
}

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const product = getProduct(handle);
  if (!product) notFound();

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-accent">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image}
            alt={product.imageAlt}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{product.title}</h1>
          <div className="flex items-center gap-2">
            <span className="text-lg">${product.price}</span>
            {product.compareAtPrice && (
              <span className="text-sm text-muted-foreground line-through">
                ${product.compareAtPrice}
              </span>
            )}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{product.description}</p>
          <button
            disabled={!product.availableForSale}
            className="w-fit rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {product.availableForSale ? "Add to cart" : "Out of stock"}
          </button>
        </div>
      </div>
    </main>
  );
}
