-- Replace the trips UPDATE policy to add a WITH CHECK that permits
-- the driver to set status back to 'pending' on resubmit.
DROP POLICY IF EXISTS "Drivers update own trips when resubmit" ON public.trips;

CREATE POLICY "Drivers update own trips when resubmit"
ON public.trips
FOR UPDATE
TO authenticated
USING (driver_id = auth.uid() AND status = 'resubmit'::trip_status)
WITH CHECK (driver_id = auth.uid() AND status IN ('pending'::trip_status, 'resubmit'::trip_status));

-- Allow drivers to update photo rows on their own trips (e.g. during resubmit).
CREATE POLICY "Drivers update photos on own trips"
ON public.trip_photos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_photos.trip_id
      AND t.driver_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_photos.trip_id
      AND t.driver_id = auth.uid()
  )
);