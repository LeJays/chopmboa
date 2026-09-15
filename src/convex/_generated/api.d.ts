/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as authz from "../authz.js";
import type * as db from "../db.js";
import type * as demoSeed from "../demoSeed.js";
import type * as http from "../http.js";
import type * as menu from "../menu.js";
import type * as orders from "../orders.js";
import type * as plans from "../plans.js";
import type * as profile from "../profile.js";
import type * as restaurants from "../restaurants.js";
import type * as roles from "../roles.js";
import type * as staff from "../staff.js";
import type * as tables from "../tables.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  authz: typeof authz;
  db: typeof db;
  demoSeed: typeof demoSeed;
  http: typeof http;
  menu: typeof menu;
  orders: typeof orders;
  plans: typeof plans;
  profile: typeof profile;
  restaurants: typeof restaurants;
  roles: typeof roles;
  staff: typeof staff;
  tables: typeof tables;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
