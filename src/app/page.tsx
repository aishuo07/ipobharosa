import { getBoardIpos } from "@/lib/board-data";
import IpoBoard from "@/components/IpoBoard";

export const revalidate = 0;

export default async function Home() {
  const ipos = await getBoardIpos();
  return <IpoBoard ipos={ipos} />;
}
