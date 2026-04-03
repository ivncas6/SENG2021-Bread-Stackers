import { APIGatewayProxyEvent } from "aws-lambda";
import { jsonResponse } from "./response";
import { getOrderByIdSupa, getUserByIdSupa } from "../dataStore";
import { getUserIdFromSession } from "../userHelper";
import { createOrderUBLXML } from "../generateUBL";


export const generateUBLHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    const orderId = event.pathParameters!.orderId!;
    const session = event.headers.session as string;
    
    const result = await createOrderUBLXML(orderId, session);

    return { result };

  } catch (e: unknown) {
    return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });
  }
}