import Link from "next/link";
export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>M-Pesa reference store</h1>
      <p>
        Demo product catalog. Replace with your own database catalog before
        launch.
      </p>
      <Link href="/checkout">Go to checkout</Link>
    </main>
  );
}
