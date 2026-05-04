import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { handleX402Request } from "@/lib/x402-handler";

export async function GET(req: NextRequest) {
  return handleX402Request(req, async () => {
    const supabase = getSupabaseServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("links")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      table: "links",
      data,
    });
  });
}
