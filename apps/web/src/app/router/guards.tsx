import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { sessionQuery } from "../../modules/identity";

export function SessionGuard() {
  const location = useLocation();
  const session = useQuery(sessionQuery);
  if (session.isPending)
    return <div className="app-boot" aria-label="正在载入" />;
  if (session.isError)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
