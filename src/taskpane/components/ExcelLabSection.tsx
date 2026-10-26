import * as React from "react";
import ExcelLabPanel from "./ExcelLabPanel";
import { ExcelLabGatewayImpl } from "../../office/excelLabGateway";

/**
 * Điểm vào của khu vực Kiểm thử Excel. App chỉ nạp module này (React.lazy) trong bản phát triển,
 * nên code kiểm thử không nằm trong bundle production.
 */
const ExcelLabSection: React.FC = () => {
  const lab = React.useMemo(() => new ExcelLabGatewayImpl(), []);
  return <ExcelLabPanel lab={lab} />;
};

export default ExcelLabSection;
