/** Complete native program; each execution fits its own explicit reference rows. */
export const housingCellExample = `agent Cell is Agent
  private
    skill numeric_segments
      "Group explicit housing features with native Rust numerical code"
  public
    ability run() -> Any effects(skill)
      csv = "area,rooms\\n40,2\\n42,2\\n44,2\\n90,4\\n92,4\\n94,4\\n180,7\\n182,7\\n184,7"
      report = self.skill("numeric_segments", csv, ["area", "rooms"], 3)
      return {features: report.model.features, groups: report.clusters, silhouette: report.mean_silhouette}
`;
