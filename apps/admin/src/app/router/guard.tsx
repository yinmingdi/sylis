import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";

import { adminSessionQuery } from "../../modules/identity";

export function AdminGuard() {
  const session = useQuery(adminSessionQuery);
  if (session.isPending) return <div className="admin-loading">载入中</div>;
  if (session.isError) return <Navigate to="/login" replace />;
  return <Outlet />;
}
