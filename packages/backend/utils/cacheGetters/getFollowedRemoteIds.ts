import { Follows, User } from "../../db.js";
import { environment } from "../../environment.js";
import { redisCache } from "../redis.js";

async function getFollowedRemoteIds(id: string) {
	const cacheResult = await redisCache.get(`remoteFollowed:${id}`);
	if (cacheResult) {
		return JSON.parse(cacheResult);
	}
	const follows = await Follows.findAll({
		order: [["createdAt", "DESC"]],
		include: [
			{
				model: User,
				as: "follower",
			},
		],
		where: {
			followerId: id,
			accepted: true,
		},
	});
	const res = follows.map((follow: any) =>
		follow.follower.url.startsWith("@")
			? follow.follower.remoteId
			: `${environment.frontendUrl}/fediverse/blog/${follow.follower.url}`,
	);
	await redisCache.set(`remoteFollowed:${id}`, JSON.stringify(res), "EX", 300);
	return res;
}

export { getFollowedRemoteIds };
