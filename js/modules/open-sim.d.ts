export type Vector3Tuple = readonly [number, number, number];
export type Axis = "x" | "y" | "z" | Vector3Tuple;
export type Unit = "rad" | "deg" | "m" | "mm";
export type ColorValue = string | number;
export type JointValues = Readonly<Record<string, number>>;
export interface RotationMap {
    node?: string;
    rotate: Axis;
    translate?: never;
    multiplier?: number;
    offset?: number;
}
export interface TranslationMap {
    node?: string;
    rotate?: never;
    translate: Axis;
    multiplier?: number;
    offset?: number;
}
export type JointMap = RotationMap | TranslationMap;
export interface JointDefinition {
    id: string;
    unit?: Unit;
    map: JointMap | readonly JointMap[];
}
export interface CameraOptions {
    position?: Vector3Tuple;
    target?: Vector3Tuple;
}
export interface NodeAppearance {
    visible?: boolean;
    color?: ColorValue;
    opacity?: number;
}
export interface PoseStyle {
    color?: ColorValue;
    opacity?: number;
}
export interface WorldTransform {
    position: [number, number, number];
    quaternion: [number, number, number, number];
    scale: [number, number, number];
    matrix: number[];
}
export interface OpenSimOptions {
    model: string | URL;
    joints?: readonly JointDefinition[];
    camera?: CameraOptions;
}
export interface Pose {
    setJoints(values: JointValues): void;
    setVisible(visible: boolean): void;
    remove(): void;
}
export declare class OpenSim {
    #private;
    private constructor();
    static create(container: string | HTMLElement, options: OpenSimOptions): Promise<OpenSim>;
    setJoints(values: JointValues): void;
    addPose(style?: PoseStyle): Pose;
    listNodes(): string[];
    getNodeWorldTransform(name: string): WorldTransform;
    setNodeAppearance(name: string, appearance: NodeAppearance): void;
    resetNodeAppearance(name: string): void;
    setCamera(options: CameraOptions): void;
    fitCamera(): void;
    destroy(): void;
}
export default OpenSim;
