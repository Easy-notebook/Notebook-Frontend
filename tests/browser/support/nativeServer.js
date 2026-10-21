import { spawn } from 'node:child_process';
import process from 'node:process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Owns only an explicitly supplied local Rust process and a disposable state directory. */
export class NativeTestServer {
  constructor(binary, target) {
    const url = new URL(target);
    if (url.hostname !== '127.0.0.1' || !url.port)
      throw new Error('Explicit loopback port required');
    this.binary = binary;
    this.port = url.port;
  }
  async start(modelEndpoint, reviewerConfig) {
    if (this.child) throw new Error('Stop the existing native server before restarting');
    this.root ??= await mkdtemp(join(tmpdir(), 'aal-browser-native-'));
    const env = { ...process.env };
    for (const name of [
      'AAL_MODEL_ROUTES',
      'AAL_MODEL_API_KEY_ENV',
      'AAL_MODEL_ENDPOINT',
      'AAL_MODEL',
    ])
      delete env[name];
    if (modelEndpoint) {
      const url = new URL(modelEndpoint);
      if (url.hostname !== '127.0.0.1') throw new Error('Only a local fixture model is allowed');
      env.AAL_MODEL_ENDPOINT = modelEndpoint;
      env.AAL_MODEL = 'browser-fixture';
    }
    const child = spawn(
      this.binary,
      [
        this.root,
        this.port,
        ...(modelEndpoint ? ['--model'] : []),
        ...(reviewerConfig ? ['--auto-review', reviewerConfig] : []),
      ],
      {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    this.child = child;
    let errors = '';
    child.stderr.on('data', (bytes) => {
      errors = (errors + bytes).slice(-8192);
    });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Rust server startup timed out: ${errors}`)),
          10000
        );
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`Rust server exited: ${code}: ${errors}`));
        });
        let output = '';
        child.stdout.on('data', (bytes) => {
          output = (output + bytes).slice(-8192);
          if (output.includes('Notebook listening at ')) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  async stop() {
    const child = this.child;
    if (!child) return;
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill();
      });
    }
    this.child = null;
  }
  async dispose() {
    await this.stop();
    if (this.root) await rm(this.root, { recursive: true, force: true });
  }
}
