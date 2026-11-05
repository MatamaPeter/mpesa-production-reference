import { NextRequest } from "next/server";
import { MediaAsset } from "@/models/MediaAsset";
import { connectDB } from "@/lib/db";
import { readMedia } from "@/lib/media";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) return new Response(null, { status: 404 });
  try {
    await connectDB();
    const asset = await MediaAsset.findById(id).lean();
    if (!asset) return new Response(null, { status: 404 });
    const etag = `"${asset.checksum}"`;
    if (req.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers: { ETag: etag } });
    const body = await readMedia(asset);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(body.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
        ETag: etag,
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
