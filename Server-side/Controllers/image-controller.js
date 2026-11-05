const catchAsync = require("../Utils/catchAsync");
const AppError = require("../Utils/appError");
const filterObj = require("../Utils/filter-object");
const Image = require("../Models/Image");
const mongoose = require("mongoose");
const cloudinary = require("../Config/cloudinary-config");
const uploadToCloudinary = require("../Utils/image-upload");
const Product = require("../Models/Product");
const Drop = require("../Models/Drop");
const logger = require("../Utils/logger");
const { imageSize } = require("image-size");
const {
  deleteLocalImage,
  isLocalImagePublicId,
  storeLocalImage,
} = require("../Utils/local-image-storage");

const MAX_IMAGES_PER_ENTITY = 10;

// Per-system-type upload constraints. Reject before Cloudinary touches anything.
const SYSTEM_IMAGE_LIMITS = {
  hero:           { minWidth: 1600, minHeight: 600,  maxBytes: 5 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/webp"] },
  ad:             { minWidth: 800,  minHeight: 800,  maxBytes: 3 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/webp"] },
  logo:           { minWidth: 256,  minHeight: 256,  maxBytes: 1 * 1024 * 1024, mimes: ["image/png", "image/webp", "image/svg+xml"] },
  "category-logo":{ minWidth: 400,  minHeight: 400,  maxBytes: 2 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/webp"] },
  "social-ugc":   { minWidth: 600,  minHeight: 600,  maxBytes: 4 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/webp"] },
};

const validateSystemImageFile = (file, type) => {
  const limits = SYSTEM_IMAGE_LIMITS[type];
  if (!limits) return null;
  if (!limits.mimes.includes(file.mimetype)) {
    return `${type} images must be one of: ${limits.mimes.join(", ")} (got ${file.mimetype})`;
  }
  if (file.size > limits.maxBytes) {
    const maxMb = (limits.maxBytes / (1024 * 1024)).toFixed(1);
    return `${type} images must be ≤${maxMb}MB (got ${(file.size / (1024 * 1024)).toFixed(1)}MB)`;
  }
  // SVG dimensions can't be read by image-size reliably; skip dimension check for SVG
  if (file.mimetype === "image/svg+xml") return null;
  try {
    const dims = imageSize(file.buffer);
    if (!dims?.width || !dims?.height) {
      return `${type} image dimensions could not be determined`;
    }
    if (dims.width < limits.minWidth || dims.height < limits.minHeight) {
      return `${type} images must be at least ${limits.minWidth}×${limits.minHeight}px (got ${dims.width}×${dims.height})`;
    }
  } catch (err) {
    return `${type} image is not a valid image file`;
  }
  return null;
};

const ADMIN_ROLES = new Set(["admin", "super_admin", "superadmin", "sub_admin"]);
const isAdminViewer = (user) => Boolean(user && ADMIN_ROLES.has(user.role));
const visibilityFilter = (req) => (isAdminViewer(req.userInfo) ? {} : { isActive: true });
const URL_ONLY_REF_MODELS = new Set(["SiteConfig", "Offer"]);

const normalizeImageRefModel = (value) => {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase().replace(/[\s_-]/g, "");
  const map = {
    product: "Product",
    drop: "Drop",
    system: "System",
    review: "Review",
    siteconfig: "SiteConfig",
    offer: "Offer",
  };

  return map[normalized] || raw;
};

const storagePathSegment = (value, fallback = "misc") => {
  const segment = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return segment || fallback;
};

// Reuse centralized Winston logger for image actions
const actionLogger = logger;

const isTransientUploadFailure = (errors = []) =>
  errors.some((error) =>
    /request timeout|timed out|etimedout|econnreset|enotfound|eai_again|socket hang up/i.test(
      String(error || "")
    )
  );

const isLocalImageFallbackEnabled = () => {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isServerless) return false;
  const runtimeEnv = String(process.env.NODE_ENV || "development").toLowerCase();
  const disabled =
    String(process.env.DISABLE_LOCAL_IMAGE_FALLBACK || "").toLowerCase() === "true";
  return runtimeEnv !== "production" && !disabled;
};

const getDevCloudinaryOptions = () => {
  if (!isLocalImageFallbackEnabled()) return undefined;

  const retries = Number(process.env.CLOUDINARY_DEV_UPLOAD_RETRIES);
  const timeout = Number(process.env.CLOUDINARY_DEV_UPLOAD_TIMEOUT_MS);

  return {
    retries: Number.isFinite(retries) && retries >= 0 ? retries : 0,
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 15000,
  };
};

const uploadToImageStorage = async (file, folder) => {
  try {
    return await uploadToCloudinary(
      file.buffer,
      folder,
      file.mimetype,
      getDevCloudinaryOptions()
    );
  } catch (error) {
    const shouldFallback =
      isLocalImageFallbackEnabled() &&
      isTransientUploadFailure([error?.message, error?.code, error?.name]);

    if (!shouldFallback) throw error;

    const localResult = await storeLocalImage({
      buffer: file.buffer,
      folder,
      mimetype: file.mimetype,
    });

    actionLogger.warn({
      action: "image_upload_local_fallback",
      folder,
      reason: error?.message || String(error),
      publicId: localResult.public_id,
      url: localResult.secure_url,
    });

    return localResult;
  }
};

const deleteImageAsset = async (publicId) => {
  if (!publicId) return null;
  if (isLocalImagePublicId(publicId)) {
    return deleteLocalImage(publicId);
  }
  return cloudinary.uploader.destroy(publicId);
};

const uploadImages = catchAsync(async (req, res, next) => {
  const imageData = filterObj(req.body, "refId", "refModel", "type", "label", "colorTag");

  // Log upload attempt
  actionLogger.info({
    action: "upload_images_attempt",
    userId: req.userInfo ? req.userInfo._id : null,
    refModel: imageData.refModel,
    refId: imageData.refId || null,
    type: imageData.type || null,
    numFiles: req.files ? req.files.length : 0,
  });

  if (!imageData.refModel) {
    return next(new AppError("refModel is required", 400));
  }

  // Normalize refModel while preserving multi-word canonical names
  // such as SiteConfig.
  imageData.refModel = normalizeImageRefModel(imageData.refModel);

  const validRefModels = ["Product", "Drop", "System", "Review", "SiteConfig", "Offer"];
  if (!validRefModels.includes(imageData.refModel)) {
    return next(new AppError("Invalid refModel", 400));
  }

  // System, SiteConfig, Offer images don't require valid ObjectId refId.
  // SiteConfig and Offer uploads are URL-only helpers used by content forms;
  // product/drop/review uploads still attach to real Mongo documents.
  if (
    imageData.refModel !== "System" &&
    !URL_ONLY_REF_MODELS.has(imageData.refModel) &&
    !imageData.refId
  ) {
    return next(new AppError("refId is required for this image type", 400));
  }

  // Validate ObjectId for standard entities
  if (
    imageData.refModel !== "System" && 
    !URL_ONLY_REF_MODELS.has(imageData.refModel) &&
    !mongoose.Types.ObjectId.isValid(imageData.refId)
  ) {
    return next(new AppError("Invalid refId", 400));
  }

  if (!req.files || req.files.length === 0) {
    return next(new AppError("No images uploaded", 400));
  }

  // Validate type for System images
  if (imageData.refModel === "System") {
    const validSystemTypes = [
      "hero",
      "ad",
      "logo",
      "category-logo",
      "social-ugc",
    ];

    if (!imageData.type || !validSystemTypes.includes(imageData.type)) {
      return next(
        new AppError(
          `System images require type: ${validSystemTypes.join(", ")}`,
          400
        )
      );
    }

    // Per-type size/format/dimension checks
    for (const file of req.files) {
      const error = validateSystemImageFile(file, imageData.type);
      if (error) return next(new AppError(error, 400));
    }
  }

  if (URL_ONLY_REF_MODELS.has(imageData.refModel)) {
    const folder = [
      "saga-elite",
      imageData.refModel === "SiteConfig" ? "site-config" : "offers",
      storagePathSegment(imageData.type || imageData.refId || "content"),
    ].join("/");

    const uploadResults = await Promise.allSettled(
      req.files.map((file) => uploadToImageStorage(file, folder))
    );

    const uploadedImages = [];
    const failedUploads = [];

    uploadResults.forEach((uploadResult, index) => {
      if (uploadResult.status === "fulfilled") {
        const result = uploadResult.value;
        uploadedImages.push({
          url: result.secure_url,
          publicId: result.public_id,
          type: imageData.type || "other",
          refModel: imageData.refModel,
          refId: imageData.refId || null,
          label: imageData.label || "",
          colorTag: imageData.colorTag || "",
          order: index,
          isPrimary: index === 0,
          metadata: {
            width: result.width,
            height: result.height,
            format: result.format,
            sizeInBytes: result.bytes,
          },
        });
        return;
      }

      failedUploads.push(
        `Upload failed: ${uploadResult.reason?.message || String(uploadResult.reason)}`
      );
    });

    if (failedUploads.length > 0) {
      await Promise.allSettled(
        uploadedImages.map((image) => deleteImageAsset(image.publicId))
      );

      const transientFailure = isTransientUploadFailure(failedUploads);
      return next(
        new AppError(
          transientFailure
            ? "Image upload service timed out. Please try again in a moment."
            : `Upload failed: ${failedUploads.join(", ")}`,
          transientFailure ? 503 : 500
        )
      );
    }

    actionLogger.info({
      action: "upload_url_only_images",
      userId: req.userInfo ? req.userInfo._id : null,
      refModel: imageData.refModel,
      refId: imageData.refId || null,
      type: imageData.type || null,
      numImagesUploaded: uploadedImages.length,
    });

    return res.status(201).json({
      success: true,
      results: uploadedImages.length,
      images: uploadedImages,
      url: uploadedImages[0]?.url,
    });
  }

  /* ==============================
     Validate Reference Exists
  ============================== */

  if (imageData.refModel === "Product") {
    const productExists = await Product.exists({ _id: imageData.refId });
    if (!productExists) return next(new AppError("Product not found", 404));
  }

  if (imageData.refModel === "Drop") {
    const dropExists = await Drop.exists({ _id: imageData.refId });
    if (!dropExists) return next(new AppError("Drop not found", 404));
  }

  /* ==============================
     Count Existing Images & Enforce Limit
  ============================== */

  const countQuery = { refModel: imageData.refModel, isDeleted: false };

  if (imageData.refModel === "System") {
    countQuery.type = imageData.type;
  } else {
    countQuery.refId = imageData.refId;
  }

  const existingImagesCount = await Image.countDocuments(countQuery);

  if (existingImagesCount + req.files.length > MAX_IMAGES_PER_ENTITY) {
    return next(
      new AppError(
        `Image limit exceeded. Max ${MAX_IMAGES_PER_ENTITY} images allowed per entity. Currently ${existingImagesCount}, trying to add ${req.files.length}.`,
        400
      )
    );
  }

  /* ==============================
     Upload To Cloudinary (throttled)
  ============================== */

  let cloudinaryFolder;
  if (imageData.refModel === "System") {
    cloudinaryFolder = `saga-elite/system/${imageData.type}`;
  } else {
    cloudinaryFolder = `saga-elite/${imageData.refModel.toLowerCase()}`;
  }

  const CONCURRENCY = 2;
  const uploadResults = [];

  for (let i = 0; i < req.files.length; i += CONCURRENCY) {
    const batch = req.files.slice(i, i + CONCURRENCY).map((file, batchIdx) => {
      const index = i + batchIdx;
      return uploadToImageStorage(file, cloudinaryFolder).then((result) => ({
        result,
        index,
      }));
    });

    const batchResults = await Promise.allSettled(batch);
    uploadResults.push(...batchResults);
  }

  // Map refModel to the correct image type
  const refModelToType = {
    Product: "product",
    Drop: "drop",
    System: imageData.type, // already validated above (hero/ad/logo)
    Review: "review",
  };

  const uploadedImages = [];
  const failedUploads = [];

  for (const uploadResult of uploadResults) {
    if (uploadResult.status === "fulfilled") {
      const { result, index } = uploadResult.value;

      try {
        const imageDoc = {
          url: result.secure_url,
          publicId: result.public_id,
          type: imageData.type || refModelToType[imageData.refModel] || "other",
          refModel: imageData.refModel,
          label: imageData.label,
          colorTag: imageData.colorTag || "",
          order: existingImagesCount + index,
          isPrimary: existingImagesCount === 0 && index === 0,
          metadata: {
            width: result.width,
            height: result.height,
            format: result.format,
            sizeInBytes: result.bytes,
          },
        };

        if (imageData.refModel !== "System") {
          imageDoc.refId = imageData.refId;
        }

        const image = await Image.create(imageDoc);
        uploadedImages.push(image);

        // Log successful upload with URL for debugging
        actionLogger.info({
          action: "image_upload_success",
          userId: req.userInfo ? req.userInfo._id : null,
          refModel: imageData.refModel,
          refId: imageData.refId || null,
          publicId: result.public_id,
          url: result.secure_url,
          storage: result.storage || "cloudinary",
          order: imageDoc.order,
        });
      } catch (dbError) {
        await deleteImageAsset(result.public_id);
        failedUploads.push(`DB save failed for upload ${index}`);
      }
    } else {
      failedUploads.push(
        `Upload failed: ${uploadResult.reason?.message || String(uploadResult.reason)}`
      );
    }
  }

  /* ==============================
     Rollback if any failed
  ============================== */

  if (failedUploads.length > 0) {
    for (const image of uploadedImages) {
      await deleteImageAsset(image.publicId);
      await Image.findByIdAndDelete(image._id);
    }

    actionLogger.error({
      action: "upload_images",
      userId: req.userInfo ? req.userInfo._id : null,
      refModel: imageData.refModel,
      refId: imageData.refId || null,
      type: imageData.type || null,
      numImagesAttempted: req.files.length,
      numFailed: failedUploads.length,
      errors: failedUploads,
    });

    const transientFailure = isTransientUploadFailure(failedUploads);
    return next(
      new AppError(
        transientFailure
          ? "Image upload service timed out. Please try again in a moment."
          : `Upload failed: ${failedUploads.join(", ")}`,
        transientFailure ? 503 : 500
      )
    );
  }

  actionLogger.info({
    action: "upload_images",
    userId: req.userInfo ? req.userInfo._id : null,
    refModel: imageData.refModel,
    refId: imageData.refId || null,
    type: imageData.type || null,
    numImagesUploaded: uploadedImages.length,
  });

  res.status(201).json({
    success: true,
    results: uploadedImages.length,
    images: uploadedImages,
  });
});

/*
|--------------------------------------------------------------------------
| Update Image (replace file)
|--------------------------------------------------------------------------
*/

const updateImage = catchAsync(async (req, res, next) => {
  const imageId = req.params.id;

  if (!imageId || !mongoose.Types.ObjectId.isValid(imageId)) {
    return next(new AppError("Valid image ID is required", 400));
  }

  const image = await Image.findById(imageId);

  if (!image || image.isDeleted) {
    return next(new AppError("Image not found", 404));
  }

  if (!req.file) {
    return next(new AppError("New image file is required", 400));
  }

  // Log update attempt
  actionLogger.info({
    action: "update_image_attempt",
    userId: req.userInfo ? req.userInfo._id : null,
    imageId,
    oldPublicId: image.publicId,
  });

  // Determine cloudinary folder
  let cloudinaryFolder;
  if (image.refModel === "System") {
    cloudinaryFolder = `saga-elite/system/${image.type}`;
  } else {
    cloudinaryFolder = `saga-elite/${image.refModel.toLowerCase()}`;
  }

  // Upload new image
  const uploadResult = await uploadToImageStorage(req.file, cloudinaryFolder);

  // Delete old image from persistent storage
  await deleteImageAsset(image.publicId);

  // Update image document
  image.url = uploadResult.secure_url;
  image.publicId = uploadResult.public_id;
  image.metadata = {
    width: uploadResult.width,
    height: uploadResult.height,
    format: uploadResult.format,
    sizeInBytes: uploadResult.bytes,
  };
  await image.save();

  // Log successful update
  actionLogger.info({
    action: "update_image_success",
    userId: req.userInfo ? req.userInfo._id : null,
    imageId,
    newPublicId: uploadResult.public_id,
    url: uploadResult.secure_url,
  });

  res.status(200).json({
    success: true,
    message: "Image updated successfully",
    image,
  });
});

const getProductImages = catchAsync(async (req, res, next) => {
  const productRefId = req.params.id;

  if (!productRefId || !mongoose.Types.ObjectId.isValid(productRefId)) {
    return next(new AppError("Valid product reference ID is required", 400));
  }

  const product = await Product.findById(productRefId);

  if (!product) {
    return next(new AppError("This product is not found", 404));
  }

  const productImages = await Image.find({
    refId: productRefId,
    refModel: "Product",
    isDeleted: false,
  }).sort({ isPrimary: -1, order: 1 });

  res.status(200).json({
    success: true,
    message: `${product.slug}'s images fetched successfully`,
    results: productImages.length,
    images: productImages,
  });
});

const getDropImages = catchAsync(async (req, res, next) => {
  const dropRefId = req.params.id;

  if (!dropRefId || !mongoose.Types.ObjectId.isValid(dropRefId)) {
    return next(new AppError("Valid drop reference ID is required", 400));
  }

  const drop = await Drop.findById(dropRefId);

  if (!drop) {
    return next(new AppError("This drop is not found", 404));
  }

  const dropImages = await Image.find({
    refId: dropRefId,
    refModel: "Drop",
    isDeleted: false,
  }).sort({ isPrimary: -1, order: 1 });

  res.status(200).json({
    success: true,
    message: `${drop.slug}'s images fetched successfully`,
    results: dropImages.length,
    images: dropImages,
  });
});

const getHeroImages = catchAsync(async (req, res, next) => {
  const heroImages = await Image.find({
    refModel: "System",
    type: "hero",
    isDeleted: false,
    ...visibilityFilter(req),
  }).sort({ isPrimary: -1, order: 1 });

  // Return empty array gracefully — no 404 when DB simply has no images yet
  // if (!heroImages.length) {
  //   return next(new AppError("No hero images found", 404));
  // }

  res.status(200).json({
    success: true,
    results: heroImages.length,
    images: heroImages,
  });
});

const getAdImages = catchAsync(async (req, res, next) => {
  const adImages = await Image.find({
    refModel: "System",
    type: "ad",
    isDeleted: false,
    ...visibilityFilter(req),
  }).sort({ isPrimary: -1, order: 1 });

  // Return empty array gracefully — no 404 when DB simply has no images yet
  // if (!adImages.length) {
  //   return next(new AppError("No ad images found", 404));
  // }

  res.status(200).json({
    success: true,
    results: adImages.length,
    images: adImages,
  });
});

const getLogoImages = catchAsync(async (req, res, next) => {
  const logoImages = await Image.find({
    refModel: "System",
    type: "logo",
    isDeleted: false,
    ...visibilityFilter(req),
  }).sort({ isPrimary: -1, order: 1 });

  if (!logoImages.length) {
    return next(new AppError("No logo images found", 404));
  }

  res.status(200).json({
    success: true,
    results: logoImages.length,
    images: logoImages,
  });
});

const escapeRegex = (value) => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getCategoryLogoImages = catchAsync(async (req, res, next) => {
  const filter = {
    refModel: "System",
    type: "category-logo",
    isDeleted: false,
    ...visibilityFilter(req),
  };

  if (req.query.label) {
    const normalizedLabel = String(req.query.label).trim();
    if (normalizedLabel) {
      filter.label = new RegExp(`^${escapeRegex(normalizedLabel)}$`, "i");
    }
  }

  const categoryLogoImages = await Image.find(filter).sort({ order: 1 });

  // Return empty array gracefully — no 404 when DB simply has no images yet
  // if (!categoryLogoImages.length) {
  //   return next(new AppError("No category logo images found", 404));
  // }

  res.status(200).json({
    success: true,
    results: categoryLogoImages.length,
    images: categoryLogoImages,
  });
});

const getReviewImages = catchAsync(async (req, res, next) => {
  const reviewRefId = req.params.id;

  if (!reviewRefId || !mongoose.Types.ObjectId.isValid(reviewRefId)) {
    return next(new AppError("Valid review reference ID is required", 400));
  }

  const reviewImages = await Image.find({
    refId: reviewRefId,
    refModel: "Review",
    isDeleted: false,
  }).sort({ isPrimary: -1, order: 1 });

  res.status(200).json({
    success: true,
    results: reviewImages.length,
    images: reviewImages,
  });
});

const getSocialUgcImages = catchAsync(async (req, res, next) => {
  const images = await Image.find({
    refModel: "System",
    type: "social-ugc",
    isDeleted: false,
    ...visibilityFilter(req),
  }).sort({ isPrimary: -1, order: 1 });

  // An empty gallery is a normal state (section simply hides on the
  // storefront) — don't surface it as a 404 console error.
  res.status(200).json({
    success: true,
    results: images.length,
    images,
  });
});

/* ==============================
   Set Primary Image
============================== */
const setPrimaryImage = catchAsync(async (req, res, next) => {
  const imageId = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(imageId)) {
    return next(new AppError("Invalid image ID", 400));
  }

  const image = await Image.findOne({ _id: imageId, isDeleted: false });
  if (!image) {
    return next(new AppError("Image not found", 404));
  }

  const siblingQuery = { refModel: image.refModel, isDeleted: false };
  if (image.refId) {
    siblingQuery.refId = image.refId;
  } else {
    siblingQuery.type = image.type;
  }

  await Image.bulkWrite([
    {
      updateMany: {
        filter: { ...siblingQuery, isPrimary: true },
        update: { $set: { isPrimary: false } },
      },
    },
    {
      updateOne: {
        filter: { _id: image._id },
        update: { $set: { isPrimary: true } },
      },
    },
  ]);

  const updatedImage = await Image.findById(image._id);

  actionLogger.info({
    action: "set_primary_image",
    userId: req.userInfo ? req.userInfo._id : null,
    imageId: image._id,
    refModel: image.refModel,
    refId: image.refId || null,
    type: image.type || null,
  });

  res.status(200).json({
    success: true,
    message: "Primary image updated successfully",
    image: updatedImage,
  });
});

/* ==============================
   Toggle Active (visibility) — distinct from soft-delete
============================== */
const toggleActiveImage = catchAsync(async (req, res, next) => {
  const imageId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(imageId)) {
    return next(new AppError("Invalid image ID", 400));
  }
  const image = await Image.findById(imageId);
  if (!image || image.isDeleted) {
    return next(new AppError("Image not found", 404));
  }
  image.isActive = !image.isActive;
  await image.save();
  actionLogger.info({
    action: "toggle_active_image",
    userId: req.userInfo ? req.userInfo._id : null,
    imageId: image._id,
    isActive: image.isActive,
  });
  res.status(200).json({
    success: true,
    message: `Image ${image.isActive ? "activated" : "deactivated"}`,
    image,
  });
});

/* ==============================
   Soft-Delete Image
============================== */
const deleteImage = catchAsync(async (req, res, next) => {
  const imageId = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(imageId)) {
    return next(new AppError("Invalid image ID", 400));
  }

  const image = await Image.findById(imageId);
  if (!image) {
    return next(new AppError("Image not found", 404));
  }

  if (image.isDeleted) {
    return next(new AppError("Image already deleted", 404));
  }

  actionLogger.info({
    action: "delete_image",
    userId: req.userInfo ? req.userInfo._id : null,
    imageId: image._id,
    refModel: image.refModel,
    refId: image.refId || null,
    type: image.type || null,
    wasPrimary: image.isPrimary,
  });

  const wasPrimary = image.isPrimary;

  image.isDeleted = true;
  image.isPrimary = false;
  await image.save();

  await deleteImageAsset(image.publicId);

  if (wasPrimary) {
    const siblingQuery = { refModel: image.refModel, isDeleted: false };
    if (image.refId) {
      siblingQuery.refId = image.refId;
    } else {
      siblingQuery.type = image.type;
    }

    const nextImage = await Image.findOne(siblingQuery).sort({ order: 1 });
    if (nextImage) {
      nextImage.isPrimary = true;
      await nextImage.save();
    }
  }

  res.status(200).json({
    success: true,
    message: "Image deleted successfully",
  });
});

/* ==============================
   Reorder Images
============================== */
const reorderImages = catchAsync(async (req, res, next) => {
  const { imageOrders } = req.body;

  if (!Array.isArray(imageOrders) || imageOrders.length === 0) {
    return next(
      new AppError(
        "imageOrders array is required (e.g. [{ imageId, order }])",
        400,
      ),
    );
  }

  for (const entry of imageOrders) {
    if (!entry.imageId || !mongoose.Types.ObjectId.isValid(entry.imageId) || typeof entry.order !== "number") {
      return next(
        new AppError("Each entry must have a valid imageId and order (number)", 400),
      );
    }
  }

  const imageIds = imageOrders.map((e) => e.imageId);
  const images = await Image.find({
    _id: { $in: imageIds },
    isDeleted: false,
  });

  if (images.length !== imageOrders.length) {
    return next(
      new AppError("One or more image IDs are invalid or deleted", 400),
    );
  }

  const refModels = [...new Set(images.map((img) => img.refModel))];
  if (refModels.length > 1) {
    return next(
      new AppError("All images must belong to the same refModel", 400),
    );
  }

  const refIds = [...new Set(images.map((img) => String(img.refId || "")))];
  if (refIds.length > 1) {
    return next(
      new AppError("All images must belong to the same entity", 400),
    );
  }

  const bulkOps = imageOrders.map((entry) => ({
    updateOne: {
      filter: { _id: entry.imageId },
      update: { $set: { order: entry.order } },
    },
  }));

  await Image.bulkWrite(bulkOps);

  const sampleImage = images[0];
  actionLogger.info({
    action: "reorder_images",
    userId: req.userInfo ? req.userInfo._id : null,
    refModel: sampleImage.refModel,
    refId: sampleImage.refId || null,
    type: sampleImage.type || null,
    affectedImageIds: imageIds,
    numImagesReordered: imageOrders.length,
  });

  res.status(200).json({
    success: true,
    message: "Image order updated successfully",
  });
});

/* ==============================
   Bulk Delete Images
============================== */
const deleteAllImages = catchAsync(async (req, res, next) => {
  const { refModel, refId, type } = req.body;

  if (!refModel) {
    return next(new AppError("refModel is required in request body", 400));
  }

  const normalizedRefModel = refModel.charAt(0).toUpperCase() + refModel.slice(1).toLowerCase();
  const validRefModels = ["Product", "Drop", "System"];
  if (!validRefModels.includes(normalizedRefModel)) {
    return next(new AppError("Invalid refModel", 400));
  }

  const query = { refModel: normalizedRefModel };
  if (normalizedRefModel === "System") {
    if (!type) {
      return next(new AppError("type is required in request body for System images", 400));
    }
    query.type = type;
  } else {
    if (!refId || !mongoose.Types.ObjectId.isValid(refId)) {
      return next(new AppError("Valid refId is required for non-System images", 400));
    }
    query.refId = refId;
  }

  const imagesToDelete = await Image.find(query);
  if (imagesToDelete.length === 0) {
    return next(new AppError("No images found to delete", 404));
  }

  await Image.deleteMany(query);

  const imageAssetDeletes = imagesToDelete.map((img) => deleteImageAsset(img.publicId));
  await Promise.allSettled(imageAssetDeletes);

  actionLogger.info({
    action: "delete_all_images",
    userId: req.userInfo ? req.userInfo._id : null,
    refModel: normalizedRefModel,
    refId: refId || null,
    type: type || null,
    numImagesDeleted: imagesToDelete.length,
    deletedImageIds: imagesToDelete.map(img => img._id),
  });

  res.status(200).json({
    success: true,
    message: `${imagesToDelete.length} images deleted successfully`,
    deletedCount: imagesToDelete.length,
  });
});

/* ==============================
   Update Image Metadata (colorTag, altText, label)
============================== */
const updateImageMeta = catchAsync(async (req, res, next) => {
  const imageId = req.params.id;

  if (!imageId || !mongoose.Types.ObjectId.isValid(imageId)) {
    return next(new AppError("Valid image ID is required", 400));
  }

  const image = await Image.findOne({ _id: imageId, isDeleted: false });
  if (!image) {
    return next(new AppError("Image not found", 404));
  }

  const allowed = filterObj(req.body, "colorTag", "altText", "label");

  if (Object.keys(allowed).length === 0) {
    return next(new AppError("Provide at least one field to update (colorTag, altText, label)", 400));
  }

  Object.assign(image, allowed);
  await image.save({ validateModifiedOnly: true });

  actionLogger.info({
    action: "update_image_meta",
    userId: req.userInfo ? req.userInfo._id : null,
    imageId: image._id,
    updatedFields: Object.keys(allowed),
  });

  res.status(200).json({
    success: true,
    message: "Image metadata updated successfully",
    image,
  });
});

/* ==============================
   Upload Receipt Image (Users)
============================== */
const uploadReceiptImage = catchAsync(async (req, res, next) => {
  actionLogger.info({
    action: "upload_receipt_attempt",
    userId: req.userInfo ? req.userInfo._id : null,
  });

  if (!req.file) {
    return next(new AppError("No receipt payload found", 400));
  }

  const result = await uploadToImageStorage(req.file, "saga-elite/receipts");

  actionLogger.info({
    action: "receipt_upload_success",
    userId: req.userInfo ? req.userInfo._id : null,
    publicId: result.public_id,
  });

  res.status(200).json({
    success: true,
    message: "Receipt uploaded successfully",
    data: {
      url: result.secure_url,
    },
  });
});

module.exports = {
  uploadImages,
  uploadReceiptImage,
  getProductImages,
  getDropImages,
  getHeroImages,
  getAdImages,
  getLogoImages,
  getCategoryLogoImages,
  getReviewImages,
  getSocialUgcImages,
  setPrimaryImage,
  toggleActiveImage,
  deleteImage,
  reorderImages,
  deleteAllImages,
  updateImage,
  updateImageMeta,
};
