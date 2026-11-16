# API guide

Every response below was recorded from a real run of the API (local run, same code as the deployed version).
Ids, timestamps and tokens will differ on your side.

- **Base URL:** `https://aegisneo-api.vercel.app` (local: `http://127.0.0.1:8000`)
- **Interactive documentation:** `/docs` (Swagger UI with an **Authorize** button)
- **Format:** JSON. Dates are `YYYY-MM-DD`. Numbers are sent as numbers, not text.

## Authentication

There are three kinds of callers.

| Caller | Credentials | May |
| --- | --- | --- |
| Guest | none | read the 10 featured asteroids |
| User | `Authorization: Bearer <token>` | read all, create, update, delete, statistics |
| Partner site | `x-api-key: <key>` | read all and statistics; any change returns 403 |

Get a token with `POST /api/v1/auth/login` (form fields, not JSON, so the Swagger Authorize button works):

```bash
curl -X POST https://aegisneo-api.vercel.app/api/v1/auth/login \
     -d "username=demo&password=YOUR_PASSWORD"
```
```json
{ "access_token": "<token>", "token_type": "bearer", "expires_in": 3600 }
```

The token is valid for 60 minutes. Send it on later requests:
`curl -H "Authorization: Bearer <token>" https://aegisneo-api.vercel.app/api/v1/auth/me` returns
`{ "id": 1, "username": "demo" }`.

An invalid or expired token is rejected with 401. It is never treated as a guest.

## Endpoints

| Method | Path | Purpose | Success | Access |
| --- | --- | --- | --- | --- |
| GET | `/` | Welcome message, number of asteroids | 200 | public |
| GET | `/health` | Status and database check | 200 / 503 | public |
| POST | `/api/v1/auth/login` | Log in | 200 | public |
| GET | `/api/v1/auth/me` | Current user | 200 | user |
| GET | `/api/v1/asteroids` | List, search, filter, sort, page | 200 | guest (featured only), user, partner |
| GET | `/api/v1/asteroids/random` | Random asteroids | 200 | guest (featured only), user, partner |
| GET | `/api/v1/asteroids/{neo_reference_id}` | One asteroid | 200 | guest (featured only), user, partner |
| POST | `/api/v1/asteroids` | Create | 201 | user |
| PATCH | `/api/v1/asteroids/{neo_reference_id}` | Change some fields | 200 | user |
| DELETE | `/api/v1/asteroids/{neo_reference_id}` | Delete | 200 | user |
| GET | `/api/v1/stats` | Catalog summary | 200 | user, partner |

### Query parameters of `GET /api/v1/asteroids`

| Parameter | Type | Meaning |
| --- | --- | --- |
| `search` | text, up to 100 characters | Name contains the text (case-insensitive). If the text is only digits, the ID is searched too. |
| `hazardous` | true / false | Only hazardous or non-hazardous |
| `min_diameter`, `max_diameter` | number (km), 0 or more | Diameter range; `min_diameter` must not be greater than `max_diameter` |
| `from_date`, `to_date` | date | Closest approach on or after / on or before |
| `sort` | `name`, `diameter`, `velocity`, `miss_distance`, `date`, `magnitude` | Default: `neo_reference_id` |
| `order` | `asc` / `desc` | Default `asc` |
| `limit` | 1 to 100 | Default 100 |
| `offset` | 0 or more | Default 0 |

`random` accepts `count` (1 to 20), `hazardous`, `min_diameter` and `max_diameter`.

The list response has `count` (rows in this page), `matched` (rows that passed the filters), `total` (size of the
catalog this caller may see: 33,511 for a user or partner, 10 for a guest), `offset`, `limit`, `access`
(`"guest"` or `"full"`), `query` (only when searching) and `asteroids`.

### Fields of an asteroid

| Field | Type | Rules |
| --- | --- | --- |
| `neo_reference_id` | text | Required on create. 1 to 10 digits. Cannot be changed afterwards. |
| `name` | text | Required. 1 to 100 characters after trimming. Unique, ignoring case. |
| `estimated_diameter_km` | number | Required. Greater than 0, at most 1000. |
| `is_potentially_hazardous` | boolean | Optional, default false. `true` or `false` only. |
| `close_approach_date` | date | Required. From 1900-01-01 to 2200-12-31. |
| `relative_velocity_km_h` | number | Required. 0 to 1,000,000. |
| `miss_distance_km` | number | Required. 0 to 1,000,000,000. |
| `absolute_magnitude` | number | Required. 0 to 40. |
| `is_featured` | boolean | Optional, default false. At most 10 asteroids can be featured. |
| `created_by`, `created_at`, `updated_at` | | Set by the server. Sending them is rejected. |

## Examples

### List as a guest (no credentials)

`GET /api/v1/asteroids?limit=2` returns 200:

```json
{
  "count": 2,
  "matched": 10,
  "total": 10,
  "offset": 0,
  "limit": 2,
  "access": "guest",
  "asteroids": [
    {
      "neo_reference_id": "2000433",
      "name": "433 Eros (A898 PA)",
      "estimated_diameter_km": 35.6076,
      "is_potentially_hazardous": false,
      "close_approach_date": "1960-12-30",
      "relative_velocity_km_h": 17340.422,
      "miss_distance_km": 74687814.6,
      "absolute_magnitude": 10.41,
      "is_featured": true,
      "created_by": null,
      "created_at": "2026-11-10T09:32:32.155180+00:00",
      "updated_at": "2026-11-10T09:32:32.155180+00:00"
    }
  ]
}
```
(second asteroid omitted here)

### Search and filter (logged in)

`GET /api/v1/asteroids?hazardous=true&min_diameter=1&sort=diameter&order=desc&limit=3` found 219 matches; the
first three were 3122 Florence (6.5094 km), 4183 Cuno (6.3029 km) and 3200 Phaethon (5.6695 km).
`GET /api/v1/asteroids?search=apophis` returns one match, `99942 Apophis (2004 MN4)`.

### Create

`POST /api/v1/asteroids` with `Authorization: Bearer <token>` and `Content-Type: application/json`:

```json
{
  "neo_reference_id": "9000001",
  "name": "Demo Rock (2026 XY)",
  "estimated_diameter_km": 0.25,
  "is_potentially_hazardous": true,
  "close_approach_date": "2026-05-17",
  "relative_velocity_km_h": 54000.5,
  "miss_distance_km": 4200000,
  "absolute_magnitude": 21.3
}
```
Response **201**:
```json
{
  "neo_reference_id": "9000001",
  "name": "Demo Rock (2026 XY)",
  "estimated_diameter_km": 0.25,
  "is_potentially_hazardous": true,
  "close_approach_date": "2026-05-17",
  "relative_velocity_km_h": 54000.5,
  "miss_distance_km": 4200000.0,
  "absolute_magnitude": 21.3,
  "is_featured": false,
  "created_by": 1,
  "created_at": "2026-11-10T09:44:51.775906+00:00",
  "updated_at": "2026-11-10T09:44:51.775906+00:00"
}
```

### Update (only the fields you send change)

`PATCH /api/v1/asteroids/9000001` with `{ "estimated_diameter_km": 0.31 }` returns **200** with the whole record;
only `estimated_diameter_km` and `updated_at` are different.

### Delete

`DELETE /api/v1/asteroids/9000001` returns **200**:
```json
{ "message": "Asteroid deleted.", "neo_reference_id": "9000001" }
```
A second delete, or a `GET`, returns 404.

### Statistics

`GET /api/v1/stats` (user or partner) returns `total`, `potentially_hazardous`, and `min`, `max` and `median` of
`estimated_diameter_km`, `relative_velocity_km_h` and `miss_distance_km`, plus the first and last
`close_approach_date`. They are computed by the database on each request.

## Error responses

| Situation | Status | Body (`detail`) |
| --- | --- | --- |
| Wrong username or password | 401 | `"Incorrect username or password."` |
| No credentials on a protected operation | 401 | `"Log in to change data."` |
| Invalid or expired token | 401 | `"Invalid or expired token."` |
| Guest opens an asteroid that is not featured | 401 | `"Log in to view this asteroid."` |
| Partner key used to change data | 403 | `"This API key is read-only."` |
| Asteroid does not exist | 404 | `"Asteroid not found."` |
| Duplicate ID or name | 409 | `"An asteroid with this neo_reference_id already exists."` |
| More than 10 featured | 409 | `"At most 10 asteroids can be featured."` |
| Body is not valid JSON | 400 | `"The request body is not valid JSON."` |
| Invalid or missing fields | 422 | A list that names each field and the reason (the submitted value is not repeated) |
| Database unreachable | 503 | `"The database is temporarily unavailable."` |
| Unexpected error | 500 | `"Internal server error."` (details only in the server log) |

Example of a **422** (body with an empty name, `"big"` as a diameter, a wrongly formatted date and a negative speed):

```json
{
  "detail": [
    { "type": "string_too_short", "loc": ["body", "name"], "msg": "String should have at least 1 character" },
    { "type": "float_type", "loc": ["body", "estimated_diameter_km"], "msg": "Input should be a valid number" },
    { "type": "date_from_datetime_parsing", "loc": ["body", "close_approach_date"],
      "msg": "Input should be a valid date or datetime, invalid character in year" },
    { "type": "greater_than_equal", "loc": ["body", "relative_velocity_km_h"],
      "msg": "Input should be greater than or equal to 0" }
  ]
}
```

Trying to send `neo_reference_id` in a `PATCH` returns 422 with `"msg": "Extra inputs are not permitted"`.
