import { Queue } from "bullmq";
import type { Response } from "express";
import { Op } from "sequelize";
import { FederatedHost, Follows, User } from "../../db.js";
import { environment } from "../../environment.js";
import type { SignedRequest } from "../../interfaces/fediverse/signedRequest.js";
import { getFollowerRemoteIds } from "../cacheGetters/getFollowerRemoteIds.js";
import { getPostAndUserFromPostId } from "../cacheGetters/getPostAndUserFromPostId.js";
import { logger } from "../logger.js";
import { getRemoteActor } from "./getRemoteActor.js";
import { postToJSONLD } from "./postToJSONLD.js";

const sendPostQueue = new Queue("processRemoteView", {
	connection: environment.bullmqConnection,
	defaultJobOptions: {
		removeOnComplete: true,
		attempts: 3,
		backoff: {
			type: "exponential",
			delay: 25000,
		},
		removeOnFail: 25000,
	},
});

async function handlePostRequest(req: SignedRequest, res: Response) {
	if (req.params?.id) {
		const cachePost = await getPostAndUserFromPostId(req.params.id);
		const post = cachePost.data;
		if (post) {
			// we get remote user async-ly
			const fediData = req.fediData as {
				fediHost: string;
				remoteUserUrl: string;
				valid: boolean;
			};
			const user = post.user;
			if (user.url.startsWith("@")) {
				// EXTERNAL USER
				res.redirect(post.remotePostId);
				return;
			}
			if (user.banned) {
				res.sendStatus(410);
				return;
			}
			const remoteActor = await getRemoteActor(
				fediData.remoteUserUrl,
				cachePost.data.user,
				false,
			);
			if (remoteActor) {
				const federatedHost = await remoteActor.getFederatedHost();
				await sendPostQueue.add("processPost", {
					postId: post.id,
					federatedHostId: federatedHost?.publicInbox ? federatedHost.id : "",
					userId: federatedHost?.publicInbox ? "" : remoteActor.id,
				});
			} else {
				logger.debug({
					message: "remote actor not found",
					fedidata: fediData,
				});
				return res.sendStatus(500);
			}
			if (post.privacy === 10) {
				res.sendStatus(403);
				return;
			}
			if (post.privacy === 1) {
				const followerIds = await getFollowerRemoteIds(user.id);
				try {
					if (remoteActor) {
						const followerServers = (
							await User.findAll({
								include: [FederatedHost],
								where: {
									id: {
										[Op.in]: (
											await Follows.findAll({
												where: {
													followedId: user.id,
												},
											})
										).map((elem: any) => elem.followerId),
									},
								},
							})
						).map((elem: any) => elem.federatedHostId);
						if (
							!(
								followerIds.includes(remoteActor.remoteId) ||
								followerServers.includes(remoteActor.federatedHostId)
							)
						) {
							res.sendStatus(403);
							return;
						}
					} else {
						res.sendStatus(403);
						return;
					}
				} catch (error) {
					logger.warn({
						message: "Error on post",
						postId: post.id,
						fediData: req.fediData,
						user: user.id,
						error: error,
					});
					res.sendStatus(500);
					return;
				}
			}
			const response = await postToJSONLD(post.id);
			res.set({
				"content-type": "application/activity+json",
			});
			res.send({
				...response.object,
				"@context": response["@context"],
			});
		} else {
			res.sendStatus(404);
		}
	} else {
		res.sendStatus(404);
	}
	res.end();
}

export { handlePostRequest };
