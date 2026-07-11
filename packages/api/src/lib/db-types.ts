import type { db } from "@balance-point/db";

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbLike = Db | Tx;
