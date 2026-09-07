import { Suspense } from "react";

import { SearchCreate } from "@/components/search-create";

export const dynamic = "force-dynamic";

export default function SearchCreatePage() {
  return (
    <Suspense>
      <SearchCreate />
    </Suspense>
  );
}
