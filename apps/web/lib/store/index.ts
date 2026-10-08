import { configureStore } from "@reduxjs/toolkit";

import { approvalApi } from "@/lib/store/approval-api";

export function makeStore() {
  return configureStore({
    reducer: {
      [approvalApi.reducerPath]: approvalApi.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(approvalApi.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
