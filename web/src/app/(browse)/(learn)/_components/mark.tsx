import { StrokeMark, type MarkProps } from "@/components/layout/logo";

/** Learn's Extension mark: an open book with the dot over its spine. */
export function LearnMark(props: MarkProps) {
  return <StrokeMark path="M8 47V26C16 22 25.5 23 32 30.5C38.5 23 48 22 56 26V47C48 44 38.5 45 32 52" dot={{ x: 32, y: 13, r: 6 }} {...props} />;
}
