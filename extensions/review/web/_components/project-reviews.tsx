import { projectReviews } from "../_lib/projects.server";
import { ReviewList } from "./review-list";

/** A project's Reviews section, or Unfiled's. */
export async function ProjectReviews({ projectKey }: { projectKey: string }) {
  return <ReviewList rows={await projectReviews(projectKey)} />;
}
