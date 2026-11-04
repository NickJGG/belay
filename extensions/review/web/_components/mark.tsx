import { StrokeMark, type IconProps, type MarkProps } from "@/components/layout/logo";
import info from "../../belay.json";

/** Review's Extension mark: a magnifier's lens and handle, with the dot inside. */
export function ReviewMark(props: MarkProps) {
  return <StrokeMark path={info.mark.path} dot={info.mark.dot} {...props} />;
}

/** The lens as a section icon, in currentColor. */
export function ReviewIcon(props: IconProps) {
  return <ReviewMark tone="current" {...props} />;
}
