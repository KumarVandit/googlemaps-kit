import { HttpClient } from '../src/client/http-client.js';
import { extractKnowledgeEntity } from '../src/parsers/knowledge.js';
import type { PbNode } from '../src/types/protobuf.js';

const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

async function probePlace(name: string, hexId: string) {
  const slug = name.replace(/ /g, '+');
  const url = `https://www.google.com/maps/place/${slug}/@${hexId}`;
  const html = await http.get<string>(url, { referer: 'https://www.google.com/maps/', raw: true });

  const patterns = [
    /getknowledgeentity[^"']*pb=([^"'&]+)/g,
    /knowledgeentity[^"']*pb=([^"'&]+)/gi,
    /"eva"[^}]{0,200}/g,
  ];

  console.log(`\n=== ${name} (${html.length} bytes) ===`);
  for (const re of patterns) {
    const matches = [...html.matchAll(re)];
    console.log(re.source.slice(0, 40), '→', matches.length);
    for (const m of matches.slice(0, 2)) {
      const pb = m[1] ? decodeURIComponent(m[1]) : m[0];
      console.log(' ', pb?.slice(0, 100));
      if (m[1]) {
        const rpcUrl = `https://www.google.com/maps/rpc/getknowledgeentity?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(decodeURIComponent(m[1]))}`;
        try {
          const data = await http.get(rpcUrl, { referer: url, includeOrigin: true, allowShortBody: true }) as PbNode;
          const entity = extractKnowledgeEntity(data);
          console.log('   OK', entity.name, entity.facts?.length);
        } catch (e) {
          console.log('   ERR', e instanceof Error ? e.message.slice(0, 50) : e);
        }
      }
    }
  }
}

async function main() {
  await probePlace('Taj Mahal', '27.1751,78.0421');
  await probePlace('Kake Di Hatti HSR Layout', '12.9121263,77.6499775');
}

main().catch(console.error);
