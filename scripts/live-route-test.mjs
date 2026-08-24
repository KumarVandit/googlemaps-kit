/**
 * Live route test: "Michigan Union, Ann Arbor" → "College of Engineering, University of Michigan"
 *
 * Tests:
 *  1. maps.route() for all four TravelModes — shows decoded metres/seconds + humanPath
 *  2. maps.route() driving + includeSteps: true — full step audit
 *  3. maps.route() transit with departureTime, transitModes, transitRoutingPreference
 *  4. Polyline helpers: decodePolyline, polylineToHumanPath, polylineToGeoJSON, summarizePolyline
 *  5. distanceMatrix for all four modes
 *  6. Field presence audit on DirectionsResult
 *
 * Run: node scripts/live-route-test.mjs
 */

import {
  sdk,
  decodePolyline,
  polylineToHumanPath,
  polylineToGeoJSON,
  summarizePolyline,
} from '../dist/index.js';

const ORIGIN      = 'Michigan Union, 530 S State St, Ann Arbor, MI';
const DESTINATION = 'College of Engineering, University of Michigan, Ann Arbor, MI';
const MODES       = ['driving', 'walking', 'bicycling', 'transit'];

// ─── helpers ──────────────────────────────────────────────────────────────────

function sep(label) {
  console.log('\n' + '═'.repeat(72));
  console.log(`  ${label}`);
  console.log('═'.repeat(72));
}

function sub(label) {
  console.log('\n── ' + label + ' ' + '─'.repeat(Math.max(0, 67 - label.length)));
}

function fmtPolyline(encoded) {
  if (!encoded) return '⚠ absent';
  const summary = summarizePolyline(encoded);
  const human = polylineToHumanPath(encoded);
  return `${summary}  →  human: [${human.slice(0, 2).join(' | ')}${human.length > 2 ? ' | …' : ''}]`;
}

function printRouteResult(result, mode, includeSteps = false) {
  sub(`[${mode.toUpperCase()}] Primary route`);
  console.log('  distance         :', result.distance ?? '⚠ undefined',
    result.distanceMeters != null ? `(${result.distanceMeters} m)` : '');
  console.log('  duration         :', result.duration ?? '⚠ undefined',
    result.durationSeconds != null ? `(${result.durationSeconds} s)` : '');
  console.log('  durationInTraffic:', result.durationInTraffic ?? '(same as free-flow)',
    result.durationInTrafficSeconds != null ? `(${result.durationInTrafficSeconds} s)` : '');
  console.log('  summary          :', result.summary ?? '(none)');
  console.log('  warnings         :', result.warnings?.length ? result.warnings : '(none)');

  if (result.bounds) {
    const { southwest: sw, northeast: ne, label } = result.bounds;
    console.log('  bounds           :', label ?? `SW(${sw.lat}, ${sw.lng}) → NE(${ne.lat}, ${ne.lng})`);
  } else {
    console.log('  bounds           : ⚠ not present');
  }

  console.log('  polyline         :', fmtPolyline(result.polyline));
  if (result.path?.length) {
    console.log('  path (decoded)   :', result.path.slice(0, 3).map(p => `(${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`).join(' → ') + (result.path.length > 3 ? ' …' : ''));
  }

  const routes = result.routes ?? [];
  console.log(`  route alts       : ${routes.length}`);
  for (const [i, r] of routes.entries()) {
    console.log(
      `    [${i}] ${(r.summary ?? '(no label)').padEnd(40)} ` +
      `${(r.duration ?? '?').padEnd(12)} / ${(r.distance ?? '?').padEnd(10)}` +
      (r.distanceMeters != null ? ` = ${r.distanceMeters} m` : '') +
      (r.durationSeconds != null ? ` / ${r.durationSeconds} s` : '') +
      (r.durationInTraffic && r.durationInTraffic !== r.duration ? `  [traffic: ${r.durationInTraffic}]` : ''),
    );
    if (r.polyline) {
      console.log(`          polyline : ${fmtPolyline(r.polyline)}`);
    }
    if (r.humanPath?.length) {
      console.log(`          humanPath: [${r.humanPath.slice(0, 2).join(' | ')}${r.humanPath.length > 2 ? ' | …' : ''}]`);
    }
  }

  const legs = result.legs ?? [];
  console.log(`  legs             : ${legs.length}`);
  for (const [li, leg] of legs.entries()) {
    const steps = leg.steps ?? [];
    console.log(`    leg[${li}]  dist=${leg.distance ?? '?'} (${leg.distanceMeters ?? '?'} m)  dur=${leg.duration ?? '?'} (${leg.durationSeconds ?? '?'} s)  steps=${steps.length}`);
    if (includeSteps && steps.length > 0) {
      console.log('    Steps:');
      for (const [si, step] of steps.entries()) {
        const pathPts = step.path?.length ?? 0;
        console.log(
          `      [${si}] ${(step.instruction ?? '').padEnd(55)} ` +
          `dist:${(step.distance ?? '-').padEnd(8)} (${step.distanceMeters ?? '-'} m)  ` +
          `dur:${(step.duration ?? '-').padEnd(8)} (${step.durationSeconds ?? '-'} s)  ` +
          `maneuver:${step.maneuver ?? '-'}  turn:${step.turn ?? '-'}  meters:${step.meters ?? '-'}  ` +
          `path:${pathPts}  poly:${step.polyline ? summarizePolyline(step.polyline) : '-'}`,
        );
        if (step.transit) {
          const t = step.transit;
          console.log(
            `           transit → line:${t.line ?? '-'}  route:${t.routeShortName ?? '-'}  headsign:${t.headsign ?? '-'}  vehicle:${t.vehicleType ?? '-'}  ` +
            `color:${t.lineColor ?? '-'}  dep:${t.departureStop ?? '-'}→${t.arrivalStop ?? '-'}  ` +
            `time:${t.departureTime ?? '-'}  depAt:${t.departureAt ?? '-'}  stops:${t.numStops ?? '-'}`,
          );
        }
      }
    }
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const maps = sdk({ hl: 'en', gl: 'us' });

  sep('Live SDK Route Test — fully decoded');
  console.log('  origin      :', ORIGIN);
  console.log('  destination :', DESTINATION);
  console.log('  modes       :', MODES.join(', '));

  // 1. route() for all modes — metrics only but now with decoded numeric fields
  sep('1 · maps.route() — metrics only, all modes (decoded)');
  for (const mode of MODES) {
    try {
      const result = await maps.route({ from: ORIGIN, to: DESTINATION, mode, includeSteps: false });
      printRouteResult(result, mode, false);
    } catch (err) {
      console.log(`  [${mode.toUpperCase()}] ERROR:`, err?.message ?? err);
    }
  }

  // 2. route() driving + steps
  sep('2 · maps.route() — driving + includeSteps: true');
  try {
    const result = await maps.route({ from: ORIGIN, to: DESTINATION, mode: 'driving', includeSteps: true });
    printRouteResult(result, 'driving', true);
  } catch (err) {
    console.log('  ERROR:', err?.message ?? err);
  }

  // 3. Transit with options wired through
  sep('3 · maps.route() — transit with departureTime + transitModes + preference');
  try {
    const departureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const result = await maps.route({
      from: ORIGIN,
      to: DESTINATION,
      mode: 'transit',
      departureTime,
      transitModes: ['bus'],
      transitRoutingPreference: 'fewer_transfers',
      includeSteps: true,
    });
    console.log(`  departureTime sent : ${departureTime} (${new Date(departureTime * 1000).toLocaleTimeString()})`);
    printRouteResult(result, 'transit-filtered', true);
  } catch (err) {
    console.log('  ERROR:', err?.message ?? err);
  }

  // 4. Polyline helper demo
  sep('4 · Polyline helpers demo');
  try {
    const result = await maps.route({ from: ORIGIN, to: DESTINATION, mode: 'driving' });
    const poly = result.routes?.[0]?.polyline ?? result.polyline;
    if (poly) {
      sub('decodePolyline()');
      const pts = decodePolyline(poly);
      console.log('  Points:', pts.length);
      console.log('  First :', pts[0]);
      console.log('  Last  :', pts[pts.length - 1]);

      sub('polylineToHumanPath()');
      const human = polylineToHumanPath(poly);
      console.log('  All human pts:', human.join(' → '));

      sub('polylineToGeoJSON()');
      const geojson = polylineToGeoJSON(poly);
      console.log('  GeoJSON type   :', geojson.type);
      console.log('  geometry type  :', geojson.geometry.type);
      console.log('  coordinates    :', JSON.stringify(geojson.geometry.coordinates));

      sub('summarizePolyline()');
      console.log(' ', summarizePolyline(poly));
    } else {
      console.log('  No polyline in result');
    }

    // Also decode the bounds label
    const route0 = result.routes?.[0];
    if (route0?.bounds?.label) {
      sub('Bounds label');
      console.log(' ', route0.bounds.label);
    }
  } catch (err) {
    console.log('  ERROR:', err?.message ?? err);
  }

  // 5. Distance matrix — all modes with decoded m/s
  sep('5 · travel.distanceMatrix.getMatrix() — all four modes');
  for (const mode of MODES) {
    try {
      const m = await maps.travel.distanceMatrix.getMatrix({
        origins: [ORIGIN],
        destinations: [DESTINATION],
        mode,
      });
      const cell = m.rows[0]?.[0];
      if (cell) {
        console.log(
          `  [${mode.padEnd(9)}] status:${cell.status}  ` +
          `dist:${(cell.distanceText ?? '?').padEnd(10)} (${cell.distanceMeters ?? '?'} m)  ` +
          `dur:${(cell.durationText ?? '?').padEnd(10)} (${cell.durationSeconds ?? '?'} s)` +
          (cell.error ? `  ERROR: ${cell.error}` : ''),
        );
      }
    } catch (err) {
      console.log(`  [${mode}] ERROR:`, err?.message ?? err);
    }
  }

  // 6. Raw field audit
  sep('6 · Field presence audit (driving + steps)');
  try {
    const raw = await maps.route({ from: ORIGIN, to: DESTINATION, mode: 'driving', includeSteps: true });

    const topFields = [
      'distance', 'distanceMeters', 'duration', 'durationSeconds',
      'durationInTraffic', 'durationInTrafficSeconds',
      'summary', 'bounds', 'legs', 'routes', 'polyline', 'path', 'warnings', 'raw',
    ];
    const present = topFields.filter((f) => {
      const v = raw[f];
      return v != null && !(Array.isArray(v) && v.length === 0);
    });
    const absent = topFields.filter((f) => !present.includes(f));
    console.log('  PRESENT :', present.join(', '));
    console.log('  ABSENT  :', absent.join(', ') || '(none)');

    // Route-level
    const route0 = raw.routes?.[0];
    if (route0) {
      const routeFields = ['distance','distanceMeters','duration','durationSeconds','durationInTraffic','durationInTrafficSeconds','summary','bounds','polyline','path','humanPath','warnings'];
      const rPresent = routeFields.filter(f => route0[f] != null && !(Array.isArray(route0[f]) && route0[f].length === 0));
      const rAbsent = routeFields.filter(f => !rPresent.includes(f));
      console.log('\n  Route[0] PRESENT :', rPresent.join(', '));
      console.log('  Route[0] ABSENT  :', rAbsent.join(', ') || '(none)');
    }

    // Step-level
    const steps = raw.legs?.[0]?.steps ?? [];
    if (steps.length > 0) {
      const sf = ['instruction','distance','distanceMeters','duration','durationSeconds','maneuver','turn','meters','roads','path','polyline','transit'];
      const audit = {};
      for (const s of sf) audit[s] = 0;
      for (const step of steps) {
        for (const s of sf) {
          const v = step[s];
          if (v != null && !(Array.isArray(v) && v.length === 0)) audit[s]++;
        }
      }
      console.log(`\n  Step field presence across ${steps.length} step(s):`);
      for (const [field, count] of Object.entries(audit)) {
        const pct = ((count / steps.length) * 100).toFixed(0);
        const bar = '█'.repeat(Math.round(count / steps.length * 20));
        const status = count === steps.length ? '✓' : count === 0 ? '✗ NEVER' : `${count}/${steps.length}`;
        console.log(`    ${field.padEnd(17)} ${bar.padEnd(21)} ${pct.padStart(3)}%  ${status}`);
      }
    }
  } catch (err) {
    console.log('  ERROR:', err?.message ?? err);
  }

  sep('Done');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
