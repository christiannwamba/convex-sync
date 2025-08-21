/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as calendar from "../calendar.js";
import type * as helpers_googleApiHelpers from "../helpers/googleApiHelpers.js";
import type * as helpers_tokenHelpers from "../helpers/tokenHelpers.js";
import type * as oauth from "../oauth.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  calendar: typeof calendar;
  "helpers/googleApiHelpers": typeof helpers_googleApiHelpers;
  "helpers/tokenHelpers": typeof helpers_tokenHelpers;
  oauth: typeof oauth;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
