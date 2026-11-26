/** Vertex shader for a full-quad pass: attribute `a` in clip space, varying `v` in 0..1. */
export const QUAD_VERTEX_SHADER =
  "attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}";

/** Contexts return null for allocations after a loss, which the lib types omit. */
function nullable<T>(value: T): T | null {
  return value;
}

const QUAD_CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

/** Compiles and links a program and makes it current; null when anything fails. */
export function createProgram(
  gl: WebGLRenderingContext,
  vertex: string,
  fragment: string,
): WebGLProgram | null {
  const vertexShader = compile(gl, gl.VERTEX_SHADER, vertex);
  const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const program = nullable(gl.createProgram());
  if (!vertexShader || !fragmentShader || !program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  gl.useProgram(program);
  return program;
}

function configureTexture(
  gl: WebGLRenderingContext,
  unit: number,
  flipY: boolean,
): WebGLTexture | null {
  const texture = nullable(gl.createTexture());
  if (!texture) return null;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
  return texture;
}

/** Uploads a decoded image as a Y-flipped linear clamped texture on `unit` (default 0). */
export function loadTexture(
  gl: WebGLRenderingContext,
  image: TexImageSource,
  unit = 0,
): WebGLTexture | null {
  const texture = configureTexture(gl, unit, true);
  if (!texture) return null;
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return texture;
}

/** Uploads raw RGBA bytes (such as a flow map) as an unflipped texture on `unit`. */
export function loadDataTexture(
  gl: WebGLRenderingContext,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  unit = 1,
): WebGLTexture | null {
  const texture = configureTexture(gl, unit, false);
  if (!texture) return null;
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  );
  return texture;
}

/** A two-triangle quad covering clip space. */
export interface FullQuad {
  /** Binds the quad to the current program's attribute `a`. */
  bind(program: WebGLProgram): void;
  /** Draws the quad. */
  draw(): void;
  /** Frees the vertex buffer. */
  dispose(): void;
}

/** Creates the shared full-screen quad; null when the buffer cannot be allocated. */
export function createFullQuad(gl: WebGLRenderingContext): FullQuad | null {
  const buffer = nullable(gl.createBuffer());
  if (!buffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW);
  return {
    bind(program) {
      const location = gl.getAttribLocation(program, "a");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    },
    draw() {
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteBuffer(buffer);
    },
  };
}
