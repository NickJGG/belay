import { StrokeMark, type IconProps, type MarkProps } from "@/components/layout/logo";
import info from "../../../../../../extensions/grill/belay.json";

/** Grill's Extension mark: an open flame outline with the ember dot inside. */
export function GrillMark(props: MarkProps) {
  return <StrokeMark path={info.mark.path} dot={info.mark.dot} {...props} />;
}

/** The flame as a section icon, in currentColor. */
export function GrillIcon(props: IconProps) {
  return <GrillMark tone="current" {...props} />;
}
