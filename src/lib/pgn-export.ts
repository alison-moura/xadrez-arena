// Gera PGN com headers padrão e dispara download como arquivo .pgn

type ExportInput = {
  matchId: string;
  pgn: string;
  whiteName: string;
  blackName: string;
  whiteRating?: number;
  blackRating?: number;
  result: string | null;
  finishedAt: string | null;
  timeControlSeconds: number | null;
  timeIncrementSeconds: number;
};

function pgnResultTag(result: string | null): string {
  if (!result) return "*";
  if (result === "WHITE_WIN" || result === "BLACK_RESIGN" || result === "BLACK_TIMEOUT") return "1-0";
  if (result === "BLACK_WIN" || result === "WHITE_RESIGN" || result === "WHITE_TIMEOUT") return "0-1";
  if (result.includes("DRAW")) return "1/2-1/2";
  return "*";
}

export function buildPgn(d: ExportInput): string {
  const date = d.finishedAt
    ? new Date(d.finishedAt).toISOString().slice(0, 10).replace(/-/g, ".")
    : "????.??.??";
  const tcTag =
    d.timeControlSeconds === null
      ? "-"
      : `${d.timeControlSeconds}${d.timeIncrementSeconds > 0 ? `+${d.timeIncrementSeconds}` : ""}`;
  const resultTag = pgnResultTag(d.result);

  // Limpa qualquer header que o pgn salvo no DB possa ter
  const body = (d.pgn ?? "")
    .replace(/^\s*\[[^\]]+\]\s*$/gm, "")
    .replace(/^[\r\n]+/, "")
    .trim();

  const finalBody = body
    ? `${body} ${resultTag}`
    : resultTag;

  const headers = [
    `[Event "Xadrez Arena"]`,
    `[Site "xadrez-arena-jgoia-com.vercel.app"]`,
    `[Date "${date}"]`,
    `[Round "-"]`,
    `[White "${d.whiteName}"]`,
    `[Black "${d.blackName}"]`,
    `[Result "${resultTag}"]`,
    d.whiteRating !== undefined && `[WhiteElo "${d.whiteRating}"]`,
    d.blackRating !== undefined && `[BlackElo "${d.blackRating}"]`,
    `[TimeControl "${tcTag}"]`,
    `[GameId "${d.matchId}"]`,
  ].filter(Boolean).join("\n");

  return `${headers}\n\n${finalBody}\n`;
}

export function downloadPgn(d: ExportInput): void {
  if (typeof window === "undefined") return;
  const text = buildPgn(d);
  const blob = new Blob([text], { type: "application/x-chess-pgn" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `xadrez-arena-${d.matchId.slice(-8)}.pgn`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
