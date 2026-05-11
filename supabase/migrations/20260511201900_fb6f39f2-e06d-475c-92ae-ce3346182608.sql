
-- Roles enum and table (separate from profiles to avoid privilege escalation)
CREATE TYPE public.app_role AS ENUM ('admin', 'broker', 'driver');
CREATE TYPE public.trip_status AS ENUM ('pending', 'approved', 'resubmit');
CREATE TYPE public.photo_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer to check role without recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','broker')
  )
$$;

-- Trips
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  car_number TEXT NOT NULL,
  trailer_number TEXT NOT NULL,
  full_name TEXT NOT NULL,
  passport_number TEXT NOT NULL,
  phone TEXT NOT NULL,
  border_crossing TEXT NOT NULL,
  vin_last4 TEXT[] NOT NULL DEFAULT '{}',
  status trip_status NOT NULL DEFAULT 'pending',
  admin_comment TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_trips_driver ON public.trips(driver_id);
CREATE INDEX idx_trips_status ON public.trips(status);

CREATE TABLE public.trip_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- van_overview, van_corners, vin_plate, vin_windshield, interior, cargo, documents
  storage_path TEXT NOT NULL,
  status photo_status NOT NULL DEFAULT 'pending',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trip_photos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_trip_photos_trip ON public.trip_photos(trip_id);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trips_updated_at BEFORE UPDATE ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + driver role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  -- Default role: driver
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'driver');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- profiles
CREATE POLICY "Users view own profile" ON public.profiles
FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles
FOR UPDATE TO authenticated USING (id = auth.uid());

-- user_roles
CREATE POLICY "Users view own roles" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- trips
CREATE POLICY "Drivers view own trips" ON public.trips
FOR SELECT TO authenticated USING (driver_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "Drivers create own trips" ON public.trips
FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());
CREATE POLICY "Drivers update own trips when resubmit" ON public.trips
FOR UPDATE TO authenticated USING (driver_id = auth.uid() AND status = 'resubmit');
CREATE POLICY "Staff update any trip" ON public.trips
FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- trip_photos
CREATE POLICY "View photos of accessible trips" ON public.trip_photos
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id
    AND (t.driver_id = auth.uid() OR public.is_staff(auth.uid())))
);
CREATE POLICY "Drivers upload photos to own trips" ON public.trip_photos
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.driver_id = auth.uid())
);
CREATE POLICY "Drivers delete photos on resubmit" ON public.trip_photos
FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id
    AND t.driver_id = auth.uid() AND t.status = 'resubmit')
);
CREATE POLICY "Staff update photos" ON public.trip_photos
FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- Storage bucket for trip photos (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('trip-photos', 'trip-photos', false)
ON CONFLICT DO NOTHING;

-- Storage RLS: drivers upload to their own trips, staff can view all
CREATE POLICY "Authenticated upload to trip-photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'trip-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "View own or staff trip-photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'trip-photos'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff(auth.uid()))
);

CREATE POLICY "Owner delete trip-photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'trip-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
