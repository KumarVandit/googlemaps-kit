import { HttpClient } from '../client/http-client.js';
import { GMapsError } from '../types/common.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  Building3d,
  Map3dBuildingsOptions,
  Map3dTerrainOptions,
  Terrain3dResult,
} from '../types/map-3d.js';

/**
 * 3D buildings and terrain mesh.
 *
 * Not available anonymously. The Maps web client renders 3D geometry from
 * binary vector tiles streamed to its WebGL renderer, not from any queryable
 * JSON or batchexecute service, so there is nothing for this SDK to call.
 * Google's paid Photorealistic 3D Tiles API is the supported route.
 */
export class Map3dService {
  constructor(_http: HttpClient, _config: GMapsConfig) {}

  /**
   * Not available.
   *
   * @throws {GMapsError} always
   */
  async getBuildings(_options: Map3dBuildingsOptions): Promise<Building3d[]> {
    throw new GMapsError(
      '3D building geometry is not exposed by any public Maps surface — it is streamed as ' +
        'binary vector tiles to the WebGL renderer. Use the Photorealistic 3D Tiles API instead.',
    );
  }

  /**
   * Not available.
   *
   * @throws {GMapsError} always
   */
  async getTerrain(_options: Map3dTerrainOptions): Promise<Terrain3dResult> {
    throw new GMapsError(
      'Terrain mesh data is not exposed by any public Maps surface. ' +
        'map.layers.getTerrain() returns the shaded relief raster tile instead.',
    );
  }
}
