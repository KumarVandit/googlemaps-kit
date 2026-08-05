/**
 * Smoke-test the OpenAPI HTTP façade.
 */
import { spawn } from 'node:child_process';

async function main(): Promise<void> {
  const port = '8799';
  const child = spawn('npx', ['tsx', 'src/server/api-server.ts'], {
    env: { ...process.env, PORT: port, HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('api-server start timeout')), 15_000);
    child.stdout?.on('data', (d: Buffer) => {
      if (String(d).includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr?.on('data', (d: Buffer) => process.stderr.write(d));
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`api-server exited early: ${code}`));
    });
  });

  try {
    await ready;
    const health = (await fetch(`http://127.0.0.1:${port}/v1/health`).then((r) => r.json())) as {
      ok: boolean;
    };
    console.log('health', health);
    if (!health.ok) process.exitCode = 1;

    const tz = (await fetch(`http://127.0.0.1:${port}/v1/timezone`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lat: 12.91, lng: 77.63 }),
    }).then((r) => r.json())) as { status: string; time_zone_id?: string };
    console.log('timezone', tz);
    if (tz.status !== 'OK') process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
