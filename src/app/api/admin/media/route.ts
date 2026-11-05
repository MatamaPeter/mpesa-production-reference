import { pageRecords } from "@/lib/pagination";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { randomBytes, createHash } from "node:crypto";
import { MediaAsset } from "@/models/MediaAsset";
import { requirePermission } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { saveMedia, removeMedia } from "@/lib/media";
import { readBytes, apiError, RequestError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
export async function GET(req: NextRequest) {
  try {
    await requirePermission("media.write");
    const page = await pageRecords(MediaAsset, req);
    return NextResponse.json({
      ...page,
      items: page.items.map((m: any) => ({
        id: m._id,
        url: `/api/media/${m._id}`,
        width: m.width,
        height: m.height,
        size: m.size,
        createdAt: m.createdAt,
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("media.write");
    await rateLimit("media-upload", actor.id, 20);
    const type = req.headers.get("content-type")?.split(";")[0];
    if (
      !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
        type ?? "",
      )
    )
      throw new RequestError("Upload a JPEG, PNG, WebP or AVIF image", 415);
    const bytes = await readBytes(req, 8 * 1024 * 1024);
    let output;
    try {
      output = await sharp(bytes, {
        limitInputPixels: 24000000,
        animated: false,
      })
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new RequestError(
        "This file is not a supported image or exceeds the image limits",
      );
    }
    const id = randomBytes(16).toString("hex"),
      location = await saveMedia(id, output.data);
    try {
      await MediaAsset.create({
        _id: id,
        ...location,
        checksum: createHash("sha256").update(output.data).digest("hex"),
        size: output.data.length,
        width: output.info.width,
        height: output.info.height,
        createdBy: actor.id,
      });
    } catch (e) {
      await removeMedia(location);
      throw e;
    }
    await audit(actor.id, "media.uploaded", id, { size: output.data.length });
    return NextResponse.json(
      {
        id,
        url: `/api/media/${id}`,
        width: output.info.width,
        height: output.info.height,
      },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}
