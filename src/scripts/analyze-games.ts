#!/usr/bin/env ts-node
/**
 * Batch Stockfish analysis script.
 * Usage: npx ts-node src/scripts/analyze-games.ts [--limit N] [--depth D]
 *
 * Requires:
 *   - ADMIN_SECRET env var (same as API)
 *   - Stockfish installed: `which stockfish` must succeed
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 */

import { createClient } from "@supabase/supabase-js";
import { analyzeMatch, computeSuspicionScore } from "../lib/stockfish-analysis";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const args = process.argv.slice(2);
const limitArg  = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
const depthArg  = args.find((a) => a.startsWith("--depth="))?.split("=")[1];
const limit = limitArg ? parseInt(limitArg) : 20;
const depth = depthArg ? parseInt(depthArg) : 15;

const SUSPICION_THRESHOLD = 60;

async function main() {
  console.log(`Analyzing up to ${limit} matches at depth ${depth}...`);

  const { data: matches, error } = await supabase
    .from("chess_matches")
    .select("id, pgn, move_count, white_user_id, black_user_id")
    .eq("status", "FINISHED")
    .is("analyzed_at", null)
    .is("bot_difficulty", null)
    .order("finished_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("DB error:", error.message);
    process.exit(1);
  }

  if (!matches?.length) {
    console.log("No matches to analyze.");
    return;
  }

  let processed = 0;
  let flagged = 0;

  for (const match of matches) {
    if (!match.pgn) {
      console.log(`[${match.id}] No PGN, skipping.`);
      continue;
    }

    console.log(`[${match.id}] Analyzing (${match.move_count} moves)...`);

    const analysis = await analyzeMatch(match.pgn, depth);
    if (!analysis) {
      console.log(`[${match.id}] Analysis failed (Stockfish not available?), skipping.`);
      break; // stop if stockfish isn't available
    }

    await supabase
      .from("chess_matches")
      .update({
        white_avg_cpl:  analysis.white.avgCpl,
        black_avg_cpl:  analysis.black.avgCpl,
        white_accuracy: analysis.white.accuracy,
        black_accuracy: analysis.black.accuracy,
        analyzed_at:    new Date().toISOString(),
      })
      .eq("id", match.id);

    const suspicion = computeSuspicionScore(analysis, match.move_count);

    const suspicious = [
      match.white_user_id && analysis.white.avgCpl < 25 ? { id: match.white_user_id, cpl: analysis.white.avgCpl } : null,
      match.black_user_id && analysis.black.avgCpl < 25 ? { id: match.black_user_id, cpl: analysis.black.avgCpl } : null,
    ].filter(Boolean) as Array<{ id: string; cpl: number }>;

    for (const player of suspicious) {
      const { data: user } = await supabase
        .from("chess_users")
        .select("suspicion_score")
        .eq("id", player.id)
        .maybeSingle();

      const newScore = Math.min(100, (user?.suspicion_score ?? 0) + suspicion / 2);
      await supabase.from("chess_users").update({ suspicion_score: newScore }).eq("id", player.id);

      if (newScore >= SUSPICION_THRESHOLD) {
        const { data: existing } = await supabase
          .from("chess_overwatch_cases")
          .select("id")
          .eq("match_id", match.id)
          .eq("accused_id", player.id)
          .maybeSingle();

        if (!existing) {
          await supabase.from("chess_overwatch_cases").insert({
            accused_id:   player.id,
            match_id:     match.id,
            votes_needed: 5,
          });
          console.log(`  ⚠ Flagged user ${player.id} (CPL=${player.cpl.toFixed(1)}, suspicion=${newScore})`);
          flagged++;
        }
      }
    }

    console.log(`  white: avgCPL=${analysis.white.avgCpl.toFixed(1)}, acc=${analysis.white.accuracy.toFixed(1)}%`);
    console.log(`  black: avgCPL=${analysis.black.avgCpl.toFixed(1)}, acc=${analysis.black.accuracy.toFixed(1)}%`);
    processed++;
  }

  console.log(`\nDone. Processed: ${processed}, Flagged: ${flagged}`);
}

main().catch(console.error);
