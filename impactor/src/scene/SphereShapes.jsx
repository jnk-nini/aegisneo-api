import { forwardRef, useMemo } from "react";
import { Line } from "@react-three/drei";
import { DoubleSide, Quaternion, Vector3 } from "three";
import { circlePoints, metersToAngle, LIFT } from "./sphereMath.js";

const Y_AXIS = new Vector3(0, 1, 0);

/** Filled spherical cap centred on `center` (unit vector). */
export const Cap = forwardRef(function Cap(
  { center, radiusM, color, opacity = 0.25, lift = LIFT, renderOrder = 1 },
  ref,
) {
  const quaternion = useMemo(
    () => new Quaternion().setFromUnitVectors(Y_AXIS, center.clone().normalize()),
    [center],
  );
  const angle = metersToAngle(radiusM);
  return (
    <mesh ref={ref} quaternion={quaternion} scale={lift} renderOrder={renderOrder} raycast={() => null}>
      <sphereGeometry args={[1, 96, Math.max(2, Math.ceil(angle * 24)), 0, Math.PI * 2, 0, angle]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={DoubleSide}
        polygonOffset
        polygonOffsetFactor={-2}
        toneMapped={false}
      />
    </mesh>
  );
});

/** Outline of a zone. */
export function Ring({ center, radiusM, color, width = 2, opacity = 1, dashed = false }) {
  const angle = metersToAngle(radiusM);
  const points = useMemo(() => circlePoints(center, angle), [center, angle]);
  const dash = angle * 0.12; // dashes scale with the ring so they look the same at any zoom
  return (
    <Line
      points={points}
      color={color}
      lineWidth={width}
      transparent
      opacity={opacity}
      dashed={dashed}
      dashSize={dash}
      gapSize={dash * 0.7}
      depthWrite={false}
      toneMapped={false}
      raycast={() => null}
    />
  );
}
