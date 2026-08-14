import type { Metadata } from "next";
import { GuertechApp } from "@/components/guertech/GuertechApp";
import "./dispatch-v2.css";

export const metadata: Metadata = {
  title: "Guertech · Dispatch v2",
  description:
    "Dispatch Guertech v2 : contraintes, appels préventif/réactif, routes Google Maps.",
};

export default function DispatchV2Page() {
  return <GuertechApp />;
}
