import { HttpClient } from '../client/http-client.js';
import { extract3dBuildings, extract3dTerrain } from '../parsers/map-3d.js';
import { createRpcClient } from '../rpc/batch-rpc.js';
import type { GMapsConfig } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import type {
  Building3d,
  Map3dBuildingsOptions,
  Map3dTerrainOptions,
  Terrain3dResult,
} from '../types/map-3d.js';

export class Map3dService {
  private http: HttpClient;
  private hl: string;
  private gl: string;
  private config: GMapsConfig;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
    this.config = config;
  }

  async getBuildings(options: Map3dBuildingsOptions): Promise<Building3d[]> {
    const psi = 'anonymous';
    const rpc = await createRpcClient(this.http, this.config);

    try {
      const data = await rpc.call('/MapsLayersService.Get3dBuildings', [
        { psi },
        null,
        [
          null,
          [
            null,
            null,
            [null, null, options.bounds.ne.lat, options.bounds.ne.lng],
            [null, null, options.bounds.sw.lat, options.bounds.sw.lng],
          ],
        ],
        null,
        options.minHeight ? [options.minHeight] : null,
        options.sort
          ? [
              options.sort === 'height'
                ? 0
                : options.sort === 'prominence'
                  ? 1
                  : 2,
            ]
          : null,
      ]);

      return extract3dBuildings(data as PbNode);
    } catch {
      return [];
    }
  }

  async getTerrain(options: Map3dTerrainOptions): Promise<Terrain3dResult> {
    const psi = 'anonymous';
    const rpc = await createRpcClient(this.http, this.config);

    try {
      const resolutionValue =
        options.resolution === 'low' ? 0 : options.resolution === 'medium' ? 1 : 2;

      const data = await rpc.call('/MapsLayersService.Get3dTerrain', [
        { psi },
        null,
        [
          null,
          [
            null,
            null,
            [null, null, options.bounds.ne.lat, options.bounds.ne.lng],
            [null, null, options.bounds.sw.lat, options.bounds.sw.lng],
          ],
        ],
        null,
        [resolutionValue],
      ]);

      return extract3dTerrain(data as PbNode, 'gltf');
    } catch {
      return {
        mesh: Buffer.alloc(0),
        format: 'gltf',
        bounds: options.bounds,
      };
    }
  }
}
