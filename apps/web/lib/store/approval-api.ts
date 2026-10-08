import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import type { ApprovalStatus } from "@/lib/user-approval-shared";

export type ApprovalStatusResponse = {
  status: ApprovalStatus;
  next: "/dashboard" | "/onboarding" | null;
};

export const approvalApi = createApi({
  reducerPath: "approvalApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  tagTypes: ["ApprovalStatus"],
  endpoints: (builder) => ({
    getApprovalStatus: builder.query<ApprovalStatusResponse, void>({
      query: () => "api/account/approval-status",
      providesTags: ["ApprovalStatus"],
    }),
    reRequestAccess: builder.mutation<{ ok: boolean; status: ApprovalStatus }, void>({
      query: () => ({
        url: "api/account/re-request-access",
        method: "POST",
      }),
      invalidatesTags: ["ApprovalStatus"],
    }),
  }),
});

export const {
  useGetApprovalStatusQuery,
  useLazyGetApprovalStatusQuery,
  useReRequestAccessMutation,
} = approvalApi;
