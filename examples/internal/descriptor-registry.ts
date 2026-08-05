import {
  createGMapsClient,
  describeRpcId,
  encodeRpcId,
  getDescriptorRegistry,
  listFeatureServices,
  listMapsAiAgentRpcIds,
} from '../../dist/internal.js';

async function main() {
  const registry = getDescriptorRegistry();

  console.log('=== Protobuf Descriptor Registry ===');
  console.log(`encoding: ${registry.encoding.formula}`);
  console.log(`batchexecute methods: ${registry.allRpcMethods.length}`);
  console.log(`MapsAiAgent RPCs: ${registry.mapsAiAgent.length}`);
  console.log(`Jd services: ${Object.keys(registry.jdServices ?? {}).length}`);

  console.log('\n=== Infrastructure RPCs ===');
  console.log(`xsrf:        ${registry.infrastructure.xsrf.rpcid} (field ${registry.infrastructure.xsrf.field})`);
  console.log(
    `envelope:    ${registry.infrastructure.batchEnvelope.rpcid} (field ${registry.infrastructure.batchEnvelope.field}, Jd ${registry.infrastructure.batchEnvelope.jd})`,
  );

  console.log('\n=== Feature layer batchexecute RPCs ===');
  for (const name of listFeatureServices()) {
    const svc = registry.featureServices[name]!;
    console.log(`  ${svc.rpcid ?? svc.rpcids?.join(',')}  ${name}`);
  }

  console.log('\n=== Semantic surfaces (place/search/reviews use these, NOT batchexecute) ===');
  for (const [key, surface] of Object.entries(registry.semanticSurfaces)) {
    console.log(`  ${key}: ${surface}`);
  }

  console.log('\n=== UI route types (_.yK) ===');
  const interesting = Object.entries(registry.uiRouteTypes).filter(([, v]) =>
    ['place', 'direction', 'search', 'review', 'local', 'knowledge', 'list', 'photo'].some((k) =>
      v.includes(k),
    ),
  );
  for (const [k, v] of interesting) {
    console.log(`  ${k}: ${v}`);
  }

  console.log('\n=== Nxa roundtrip ===');
  const field = 421_707_520;
  const rpcid = encodeRpcId(field);
  const described = describeRpcId(rpcid);
  console.log(`field ${field} -> rpcid ${rpcid} -> field ${described.field}`);

  console.log('\n=== MapsAiAgent sample ===');
  console.log(listMapsAiAgentRpcIds().slice(0, 5).join(', '));

  const maps = createGMapsClient({ hl: 'en', gl: 'in' });
  const runtime = await maps.runtime();
  console.log(`\nRuntime lazy modules: ${runtime.lazyModuleCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
