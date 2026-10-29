import { StrokeMark, type IconProps, type MarkProps } from "@/components/layout/logo";
import info from "../../belay.json";

/** Learn's Extension mark: an open book with the dot over its spine. */
export function LearnMark(props: MarkProps) {
  return <StrokeMark path={info.mark.path} dot={info.mark.dot} {...props} />;
}

/** The book as a nav icon, in currentColor. */
export function LearnIcon(props: IconProps) {
  return <LearnMark tone="current" {...props} />;
}
