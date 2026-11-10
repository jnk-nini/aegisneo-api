"""Request models. The limits match the CHECK constraints in db/schema.sql."""
from datetime import date
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

MIN_DATE = date(1900, 1, 1)
MAX_DATE = date(2200, 12, 31)

# strict=True keeps "5" or 1 from being accepted as a number or a boolean;
# allow_inf_nan=False rejects NaN and Infinity, which PostgreSQL would store.
Number = lambda **kw: Annotated[float, Field(strict=True, allow_inf_nan=False, **kw)]  # noqa: E731

NeoId = Annotated[str, StringConstraints(strict=True, pattern=r"^[0-9]{1,10}$")]
Name = Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=100)]
Diameter = Number(gt=0, le=1000)
Velocity = Number(ge=0, le=1_000_000)
MissDistance = Number(ge=0, le=1_000_000_000)
Magnitude = Number(ge=0, le=40)
ApproachDate = Annotated[date, Field(ge=MIN_DATE, le=MAX_DATE)]


class AsteroidCreate(BaseModel):
    # Unknown fields (created_by, created_at, ...) are rejected, not ignored.
    model_config = ConfigDict(extra="forbid")

    neo_reference_id: NeoId
    name: Name
    estimated_diameter_km: Diameter
    is_potentially_hazardous: Annotated[bool, Field(strict=True)] = False
    close_approach_date: ApproachDate
    relative_velocity_km_h: Velocity
    miss_distance_km: MissDistance
    absolute_magnitude: Magnitude
    is_featured: Annotated[bool, Field(strict=True)] = False


class AsteroidUpdate(BaseModel):
    """Partial update: only the fields that are sent are changed.

    neo_reference_id is not a field here, so sending it is rejected.
    """
    model_config = ConfigDict(extra="forbid")

    name: Optional[Name] = None
    estimated_diameter_km: Optional[Diameter] = None
    is_potentially_hazardous: Optional[Annotated[bool, Field(strict=True)]] = None
    close_approach_date: Optional[ApproachDate] = None
    relative_velocity_km_h: Optional[Velocity] = None
    miss_distance_km: Optional[MissDistance] = None
    absolute_magnitude: Optional[Magnitude] = None
    is_featured: Optional[Annotated[bool, Field(strict=True)]] = None

    @model_validator(mode="after")
    def at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("Send at least one field to update.")
        for field in self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null.")
        return self
