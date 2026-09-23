import Link from "next/link";

import { cn } from "@/lib/cn";
import type { Product } from "@/lib/products";

function formatPrice(product: Product): string {
  const symbol = product.currencyCode === "USD" ? "$" : `${product.currencyCode} `;
  return `${symbol}${product.price}`;
}

function discountPercent(product: Product): number | null {
  if (!product.compareAtPrice) return null;
  const price = parseFloat(product.price);
  const compareAt = parseFloat(product.compareAtPrice);
  if (compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

export function ProductCard({ product }: { product: Product }) {
  const discount = discountPercent(product);
  return (
    <Link href={`/products/${product.handle}`} className="block">
      <article data-slot="product-card" className="flex h-full flex-col overflow-hidden">
      <div data-slot="product-card-image" className="relative aspect-square overflow-hidden bg-accent">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt={product.imageAlt}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        {!product.availableForSale && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="rounded bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground">
              Out of Stock
            </span>
          </div>
        )}
      </div>
      <div data-slot="product-card-content" className="flex flex-1 flex-col py-2.5">
        <h3 className="line-clamp-1 text-sm font-medium">{product.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm">{formatPrice(product)}</span>
          {product.compareAtPrice && discount !== null && (
            <>
              <span className="text-xs text-muted-foreground line-through">
                {formatPrice({ ...product, price: product.compareAtPrice })}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[11px] font-medium",
                  "bg-emerald-100 text-emerald-800",
                )}
              >
                -{discount}%
              </span>
            </>
          )}
        </div>
      </div>
      </article>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden" data-slot="product-card-skeleton">
      <div className="aspect-square animate-pulse bg-accent" />
      <div className="grid h-12 box-content gap-2 py-2.5">
        <div className="h-4 w-full animate-pulse bg-accent" />
        <div className="h-4 w-12 animate-pulse bg-accent" />
      </div>
    </div>
  );
}
