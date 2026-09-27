import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "../http";

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

function isPrivateV4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateV4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateV4(mapped[1]);
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") ||
    v6.startsWith("ff")
  );
}

/** Refuse anything that isn't a public http(s) host on a standard port. */
async function assertPublicUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new HttpError(400, "Only web links work here");
  if (url.port && url.port !== "80" && url.port !== "443") throw new HttpError(400, "That link isn't a normal web page");
  if (url.username || url.password) throw new HttpError(400, "Links with passwords aren't supported");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new HttpError(400, "That link isn't a public web page");
  }
  let addresses: { address: string }[];
  try {
    addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new HttpError(422, "Couldn't find that website");
  }
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) {
    throw new HttpError(400, "That link isn't a public web page");
  }
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break; // recipe JSON-LD is nearly always in the <head>; a truncated page is still useful
    }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const charset = res.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase();
  try {
    return new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8").decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

export type FetchedPage = { url: string; html: string };

/** Fetch a recipe page with SSRF protection, manual redirects, a timeout and a size cap. */
export async function fetchPage(input: string): Promise<FetchedPage> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, "That doesn't look like a link");
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "en-GB,en;q=0.9",
        },
      });
    } catch (err) {
      if ((err as Error).name === "TimeoutError") throw new HttpError(504, "That website took too long to answer");
      throw new HttpError(502, "Couldn't reach that website");
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new HttpError(502, "That website sent a broken redirect");
      url = new URL(location, url);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(422, "That website blocks automatic reading — try a photo or paste the recipe instead");
    }
    if (!res.ok) throw new HttpError(422, `That page returned an error (${res.status})`);

    const type = res.headers.get("content-type") ?? "";
    if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      throw new HttpError(415, "That link isn't a web page");
    }
    return { url: url.toString(), html: await readCapped(res) };
  }
  throw new HttpError(502, "Too many redirects");
}
