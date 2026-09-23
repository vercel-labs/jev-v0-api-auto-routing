import { ProductCard } from "@/components/product-card";
import { products } from "@/lib/products";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <section className="grid">
        <div className="col-start-1 row-start-1 hidden aspect-4/1 md:block" />
        <div className="relative col-start-1 row-start-1 flex items-center justify-center px-5 py-10 lg:px-10">
          <div className="flex flex-col items-center gap-2.5 text-center">
            <h1 className="max-w-3xl text-3xl md:text-5xl">Goods for slow mornings</h1>
            <p className="max-w-xl text-sm text-muted-foreground md:text-base">
              Small-batch home goods, shipped from a single workshop.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl sm:text-3xl">Products</h2>
          <span className="text-sm font-medium text-muted-foreground">
            {products.length} items
          </span>
        </div>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.handle} product={product} />
          ))}
        </div>
      </section>
    </main>
  );
}
