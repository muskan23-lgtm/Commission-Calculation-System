import { ReactNode, useEffect } from "react";
import { Auth } from "../store/auth";
import { useNavigate } from "react-router-dom";

export default function Guard({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  useEffect(() => { if (!Auth.isAuthed()) nav("/login"); }, [nav]);
  return <>{children}</>;
}
